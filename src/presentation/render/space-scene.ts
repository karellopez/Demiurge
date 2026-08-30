/**
 * Adapter: the space view.
 *
 * Wires the catalogue, the propagator, the camera rig and the floating origin to
 * three.js. Each frame it advances every body to the current simulated time,
 * asks the rig where the camera should be, converts each f64 heliocentric
 * position into an f32 offset from that camera, applies the display scale, and
 * draws.
 *
 * **Scale is applied here and nowhere else.** The simulation is always in true
 * metres; `distanceScale` multiplies the render offset and `sizeScale` the body
 * radii, both on the way to the GPU. Because the transform is linear about the
 * system origin, scaling the whole universe and then subtracting the camera is
 * the same as subtracting and then scaling, so it costs one multiply on a number
 * already being computed — and orbits, gravity and collision never see it.
 *
 * @module
 */

import type { PerspectiveCamera, WebGLRenderer } from 'three';

import type { BodyCatalog } from '@domain/body';
import { createCameraFrame } from '@domain/camera/camera-frame';
import { toRenderSpaceFloat32 } from '@domain/floating-origin';
import type { ScaleSettings } from '@domain/scale';
import type { BodyPositions, CameraRig } from '@features/camera/camera-rig';
import type { SceneRenderer } from '@features/engine/ports';
import { createSystemState, type SystemState } from '@features/space/propagate-system';
import { createVec3, scale as scaleVec, type Vec3 } from '@shared/math/vec3';
import { seconds, type Seconds } from '@shared/units';

import { createRenderer, createSceneCamera, resizeToCanvas } from './render-target';
import { createScaleController } from './scale-controller';
import type { createSolarSystemVisuals, placeVisual } from './solar-system-scene';

/** What the space scene needs to be built. */
export interface SpaceSceneOptions {
  /** The canvas to draw into. */
  readonly canvas: HTMLCanvasElement;
  /** The bodies to draw. */
  readonly catalog: BodyCatalog;
  /** Builds the visuals. Injected so a test can supply a stub without a GPU. */
  readonly buildVisuals: typeof createSolarSystemVisuals;
  /** Writes a body's render-space position into its visuals. */
  readonly place: typeof placeVisual;
  /** Reads wall-clock seconds. */
  readonly wallClockSeconds: () => number;
  /**
   * Builds the camera rig over the propagated positions. The rig is handed the
   * narrow read-only view rather than the whole system state, so it cannot
   * advance time behind the engine's back.
   */
  readonly buildRig: (positions: BodyPositions) => CameraRig;
}

/** The space scene, plus the handles the rest of the app needs. */
export interface SpaceScene extends SceneRenderer {
  /** Where the bodies are, so the stats card reads the same numbers. */
  readonly positions: SystemState;
  /** The camera rig, so input can drive it. */
  readonly rig: CameraRig;
  /**
   * Starts a scale transition.
   *
   * @param target - The settings to move to.
   */
  setScale(target: ScaleSettings): void;
  /**
   * Reads the scale currently applied.
   *
   * @returns The settings in force this frame.
   */
  currentScale(): ScaleSettings;
  /**
   * Reads the camera's world position, for the stats card.
   *
   * @param out - The vector to write into.
   * @returns `out`.
   */
  readCameraPosition(out: Vec3): Vec3;
}

/** Everything one render pass needs, gathered once at construction. */
interface RenderContext {
  readonly renderer: WebGLRenderer;
  readonly camera: PerspectiveCamera;
  readonly canvas: HTMLCanvasElement;
  readonly visuals: ReturnType<typeof createSolarSystemVisuals>;
  readonly place: typeof placeVisual;
  readonly cameraFrame: ReturnType<typeof createCameraFrame>;
  readonly scaleController: ReturnType<typeof createScaleController>;
  readonly renderPosition: Vec3;
  /**
   * Computes a body's scaled offset from the camera.
   *
   * @param bodyId - The body to place.
   * @returns A scratch vector holding the offset, in render space.
   */
  offsetFor(bodyId: string): Vec3;
}

/**
 * Draws one frame.
 *
 * @param context - Everything the pass needs.
 */
function renderFrame(context: RenderContext): void {
  const { renderer, camera, canvas, visuals, place, cameraFrame, renderPosition } = context;
  const distanceScale = context.scaleController.current().distanceScale;

  resizeToCanvas(renderer, camera, canvas);

  // The camera is the render origin, so in render space it sits at the origin
  // and only rotates.
  camera.position.set(0, 0, 0);
  camera.up.set(cameraFrame.up.x, cameraFrame.up.y, cameraFrame.up.z);
  toRenderSpaceFloat32(renderPosition, cameraFrame.target, cameraFrame.position);
  scaleVec(renderPosition, renderPosition, distanceScale);
  camera.lookAt(renderPosition.x, renderPosition.y, renderPosition.z);

  for (const visual of visuals.visuals) {
    place(visual, context.offsetFor(visual.body.id));

    // Orbit lines are drawn in the parent's frame, so they follow the parent
    // rather than the body, and shrink with the distance scale.
    const line = visual.orbitLine;
    if (line !== undefined) {
      const parentOffset = context.offsetFor(visual.body.parentId ?? '');
      line.position.set(parentOffset.x, parentOffset.y, parentOffset.z);
      line.scale.setScalar(distanceScale);
    }
  }

  renderer.render(visuals.scene, camera);
}

/**
 * Builds the renderer, camera and scratch a render pass needs.
 *
 * @param options - The scene options.
 * @param visuals - The bodies already added to the scene.
 * @param system - Where those bodies are.
 * @returns The render context, ready to draw with.
 */
function createRenderContext(
  options: SpaceSceneOptions,
  visuals: ReturnType<typeof createSolarSystemVisuals>,
  system: SystemState,
): RenderContext {
  const camera = createSceneCamera();

  // PERF: mutable for zero-alloc — reused every frame, for every body.
  const bodyWorldPosition = createVec3();
  const renderPosition = createVec3();
  const cameraFrame = createCameraFrame();
  const scaleController = createScaleController(visuals);

  return {
    renderer: createRenderer(options.canvas),
    camera,
    canvas: options.canvas,
    visuals,
    place: options.place,
    cameraFrame,
    scaleController,
    renderPosition,
    offsetFor(bodyId: string): Vec3 {
      system.readPosition(bodyId, bodyWorldPosition);
      toRenderSpaceFloat32(renderPosition, bodyWorldPosition, cameraFrame.position);
      return scaleVec(renderPosition, renderPosition, scaleController.current().distanceScale);
    },
  };
}

/**
 * Creates the space scene.
 *
 * @param options - The canvas, the catalogue, and the builders to use.
 * @returns A scene the engine can drive.
 */
export function createSpaceScene(options: SpaceSceneOptions): SpaceScene {
  const { catalog, buildVisuals, wallClockSeconds, buildRig } = options;

  const system = createSystemState(catalog);
  system.update(seconds(0));

  const rig = buildRig(system);
  const visuals = buildVisuals(catalog, 0);
  const context = createRenderContext(options, visuals, system);
  const { renderer, cameraFrame, scaleController } = context;

  let previousWallClock = wallClockSeconds();

  return {
    positions: system,
    rig,

    step(simTimeSeconds: Seconds): void {
      system.update(simTimeSeconds);
    },

    render(): void {
      const now = wallClockSeconds();
      const deltaSeconds = Math.max(0, now - previousWallClock);
      previousWallClock = now;

      scaleController.advance(deltaSeconds);
      rig.update(cameraFrame, seconds(deltaSeconds), now);
      renderFrame(context);
    },

    setScale(target: ScaleSettings): void {
      scaleController.setTarget(target);
    },

    currentScale(): ScaleSettings {
      return scaleController.current();
    },

    readCameraPosition(out: Vec3): Vec3 {
      out.x = cameraFrame.position.x;
      out.y = cameraFrame.position.y;
      out.z = cameraFrame.position.z;
      return out;
    },

    readCounters(): { drawCalls: number; triangles: number } {
      return {
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
      };
    },

    dispose(): void {
      visuals.dispose();
      renderer.dispose();
    },
  };
}
