/**
 * Adapter: the space view.
 *
 * Wires the catalogue, the propagator and the floating origin to three.js. Each
 * frame it advances every body to the current simulated time, converts each f64
 * heliocentric position into an f32 offset from the camera, and draws.
 *
 * The camera for phase 2 is a slow overhead orbit of the whole system, framed to
 * hold Saturn. Phase 3 replaces it with the real rig — follow modes, body
 * selection, smooth transitions — so this deliberately does the least it can
 * while still making the system legible.
 *
 * @module
 */

import { Color, PerspectiveCamera, WebGLRenderer } from 'three';

import type { BodyCatalog } from '@domain/body';
import { toRenderSpaceFloat32 } from '@domain/floating-origin';
import type { SceneRenderer } from '@features/engine/ports';
import { createSystemState } from '@features/space/propagate-system';
import type {
  createSolarSystemVisuals,
  placeVisual,
} from '@presentation/render/solar-system-scene';
import { createVec3, set, type Vec3 } from '@shared/math/vec3';
import { METERS_PER_AU, seconds, type Seconds } from '@shared/units';

/**
 * How far the camera sits from the Sun.
 *
 * Forty astronomical units holds Neptune's orbit comfortably. Eris reaches
 * ninety-seven at aphelion and does not fit; that is honest rather than a
 * framing bug, and phase 3's camera rig lets the player go and look.
 */
const CAMERA_DISTANCE_METERS = METERS_PER_AU * 40;

/**
 * How far above the ecliptic the camera rides, as a fraction of its distance.
 *
 * A little over one, so the view is about fifty degrees above the plane: high
 * enough that the orbits read as ellipses rather than as lines, low enough that
 * the system still looks like a disc seen in perspective.
 */
const CAMERA_ELEVATION = 1.2;

/** Wall-clock seconds for the camera to complete one lap. */
const CAMERA_ORBIT_PERIOD_SECONDS = 180;

/** Near plane, in metres. */
const NEAR_PLANE_METERS = 0.01;

/** Far plane, in metres. Past Eris at aphelion. */
const FAR_PLANE_METERS = 1e14;

/**
 * Creates the renderer.
 *
 * @param canvas - The canvas to draw into.
 * @returns A configured WebGL renderer.
 */
function createRenderer(canvas: HTMLCanvasElement): WebGLRenderer {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
    logarithmicDepthBuffer: true,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(new Color(0x03_04_07), 1);
  return renderer;
}

/**
 * Keeps the drawing buffer matched to the canvas's displayed size.
 *
 * @param renderer - The renderer to resize.
 * @param camera - The camera whose aspect ratio follows the canvas.
 * @param canvas - The canvas being displayed.
 */
function resizeToCanvas(
  renderer: WebGLRenderer,
  camera: PerspectiveCamera,
  canvas: HTMLCanvasElement,
): void {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width === 0 || height === 0 || (canvas.width === width && canvas.height === height)) {
    return;
  }
  renderer.setSize(width, height, false);
  // eslint-disable-next-line no-param-reassign -- three.js cameras are mutated in place; there is no immutable resize. https://github.com/karellopez/Demiurge/issues/2
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

/**
 * Places the camera in f64 heliocentric space.
 *
 * @param out - The vector to write the camera position into.
 * @param wallClockSeconds - Real elapsed time, so the view drifts even when paused.
 */
function placeCamera(out: Vec3, wallClockSeconds: number): void {
  const angle = (wallClockSeconds / CAMERA_ORBIT_PERIOD_SECONDS) * Math.PI * 2;
  // The simulation frame is the J2000 ecliptic: the plane of the planets is XY
  // and +Z is its north pole. Elevation is therefore on Z, not on Y. Getting
  // this wrong stands the whole solar system on edge, which is exactly how it
  // first came out.
  set(
    out,
    Math.cos(angle) * CAMERA_DISTANCE_METERS,
    Math.sin(angle) * CAMERA_DISTANCE_METERS,
    CAMERA_ELEVATION * CAMERA_DISTANCE_METERS,
  );
}

/** What the space scene needs to be built. */
export interface SpaceSceneOptions {
  /** The canvas to draw into. */
  readonly canvas: HTMLCanvasElement;
  /** The bodies to draw. */
  readonly catalog: BodyCatalog;
  /** Builds the visuals. Injected so a test can supply a stub without a GPU. */
  readonly buildVisuals: typeof createSolarSystemVisuals;
  /** Reads wall-clock seconds, for the camera drift. */
  readonly wallClockSeconds: () => number;
  /** Writes the render-space position of a body into its visuals. */
  readonly place: typeof placeVisual;
}

/**
 * Creates the space scene.
 *
 * @param options - The canvas, the catalogue, and the builders to use.
 * @returns A scene renderer the engine can drive.
 */
export function createSpaceScene(options: SpaceSceneOptions): SceneRenderer {
  const { canvas, catalog, buildVisuals, wallClockSeconds, place } = options;

  const renderer = createRenderer(canvas);
  const camera = new PerspectiveCamera(50, 1, NEAR_PLANE_METERS, FAR_PLANE_METERS);
  // three.js assumes Y is up; the ecliptic frame's north pole is +Z. Telling the
  // camera so is what keeps `lookAt` from rolling the system onto its side.
  camera.up.set(0, 0, 1);
  const system = createSystemState(catalog);
  const visuals = buildVisuals(catalog, 0);

  // PERF: mutable for zero-alloc — reused every frame, for every body.
  const cameraWorldPosition = createVec3();
  const bodyWorldPosition = createVec3();
  const renderPosition = createVec3();
  const heliocentricOrigin = createVec3(0, 0, 0);

  system.update(seconds(0));

  return {
    step(simTimeSeconds: Seconds): void {
      system.update(simTimeSeconds);
    },

    render(): void {
      resizeToCanvas(renderer, camera, canvas);
      placeCamera(cameraWorldPosition, wallClockSeconds());

      // The camera is the render origin, so in render space it sits at the
      // origin and only rotates. It looks back at the Sun.
      camera.position.set(0, 0, 0);
      toRenderSpaceFloat32(renderPosition, heliocentricOrigin, cameraWorldPosition);
      camera.lookAt(renderPosition.x, renderPosition.y, renderPosition.z);

      for (const visual of visuals.visuals) {
        system.readPosition(visual.body.id, bodyWorldPosition);
        toRenderSpaceFloat32(renderPosition, bodyWorldPosition, cameraWorldPosition);
        place(visual, renderPosition);

        // Orbit lines are drawn in the parent's frame, so they follow the parent
        // rather than the body.
        const line = visual.orbitLine;
        if (line !== undefined) {
          const parentId = visual.body.parentId;
          system.readPosition(parentId ?? '', bodyWorldPosition);
          toRenderSpaceFloat32(renderPosition, bodyWorldPosition, cameraWorldPosition);
          line.position.set(renderPosition.x, renderPosition.y, renderPosition.z);
        }
      }

      renderer.render(visuals.scene, camera);
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
