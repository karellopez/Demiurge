/**
 * Adapter: the phase-1 precision scene.
 *
 * This is the scene that proves the floating origin and the depth buffer work
 * before a single planet is drawn. It holds two one-metre cubes: one at 1 au
 * from the origin, one at 4.5e12 m — Neptune's distance. Both must sit rock
 * still while the camera moves, and both must render without z-fighting against
 * a far plane thirteen orders of magnitude away.
 *
 * A naive pipeline fails this scene spectacularly. At 4.5e12 m the gap between
 * consecutive f32 values is about half a megametre, so the far cube would either
 * vanish, jitter across half a continent per frame, or z-fight with everything.
 * Here every position handed to three.js is already `f64(world) - f64(camera)`,
 * so the numbers reaching the GPU are single digits.
 *
 * Depth is handled by three.js's logarithmic depth buffer; see
 * `docs/adr/0005-logarithmic-depth-buffer.md` for why that rather than a
 * two-frustum split.
 *
 * @module
 */

import { Color, PerspectiveCamera, WebGLRenderer } from 'three';

import { toRenderSpaceFloat32 } from '@domain/floating-origin';
import type { SceneRenderer } from '@features/engine/ports';
import { createVec3, set, type Vec3 } from '@shared/math/vec3';
import { METERS_PER_AU, type Seconds } from '@shared/units';

import {
  createSceneContents,
  disposeSceneContents,
  NEAR_CUBE_OFFSET_METERS,
} from './precision-cubes';

/** How far the camera drifts to either side while looking down +X, in metres. */
const CAMERA_DRIFT_METERS = 1.5;

/** Seconds for the camera to complete one orbit. */
const CAMERA_ORBIT_PERIOD_SECONDS = 20;

/** Near plane, in metres. A centimetre, so a rock at arm's length is not clipped. */
const NEAR_PLANE_METERS = 0.01;

/** Far plane, in metres. Past Neptune, with room to spare. */
const FAR_PLANE_METERS = 1e13;

/**
 * Creates the WebGL renderer.
 *
 * @param canvas - The canvas to render into.
 * @returns A configured renderer.
 */
function createRenderer(canvas: HTMLCanvasElement): WebGLRenderer {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
    // The whole point of the scene. Without this the far cube z-fights against
    // a far plane thirteen orders of magnitude away.
    logarithmicDepthBuffer: true,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(new Color(0x05_07_0a), 1);
  return renderer;
}

/**
 * Places the camera in f64 world space for a given moment.
 *
 * The camera sits just behind the near cube looking down +X, so all three bodies
 * are in front of it, and drifts gently sideways. The drift is what makes a
 * precision failure visible: a jittering object is obvious against a moving
 * camera and easy to miss against a still one.
 *
 * @param out - The vector to write the camera's world position into.
 * @param simTimeSeconds - Simulation time.
 */
function placeCamera(out: Vec3, simTimeSeconds: number): void {
  const angle = (simTimeSeconds / CAMERA_ORBIT_PERIOD_SECONDS) * Math.PI * 2;
  set(
    out,
    METERS_PER_AU,
    Math.sin(angle) * CAMERA_DRIFT_METERS * 0.4,
    Math.cos(angle) * CAMERA_DRIFT_METERS,
  );
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
  if (width === 0 || height === 0) {
    return;
  }
  if (canvas.width !== width || canvas.height !== height) {
    renderer.setSize(width, height, false);
    // eslint-disable-next-line no-param-reassign -- three.js cameras are mutated in place; there is no immutable resize. https://github.com/karellopez/Demiurge/issues/2
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
}

/**
 * Creates the precision test scene.
 *
 * @param canvas - The canvas to render into.
 * @returns A scene renderer the engine can drive.
 */
export function createPrecisionScene(canvas: HTMLCanvasElement): SceneRenderer {
  const renderer = createRenderer(canvas);
  const { scene, bodies } = createSceneContents();
  const camera = new PerspectiveCamera(55, 1, NEAR_PLANE_METERS, FAR_PLANE_METERS);

  // PERF: mutable for zero-alloc — reused every frame, for every cube.
  const cameraWorldPosition = createVec3();
  const renderPosition = createVec3();
  let currentSimTimeSeconds = 0;

  return {
    step(simTimeSeconds: Seconds): void {
      currentSimTimeSeconds = simTimeSeconds;
    },

    render(): void {
      resizeToCanvas(renderer, camera, canvas);
      placeCamera(cameraWorldPosition, currentSimTimeSeconds);

      // The camera is the render origin, so in render space it is always at
      // (0, 0, 0) and only ever rotates. It looks down +X, past the near cube
      // and on towards the sphere and, nominally, Neptune.
      camera.position.set(0, 0, 0);
      camera.lookAt(NEAR_CUBE_OFFSET_METERS, 0, 0);

      for (const body of bodies) {
        toRenderSpaceFloat32(renderPosition, body.worldPositionMeters, cameraWorldPosition);
        body.mesh.position.set(renderPosition.x, renderPosition.y, renderPosition.z);
      }

      renderer.render(scene, camera);
    },

    readCounters(): { drawCalls: number; triangles: number } {
      return {
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
      };
    },

    dispose(): void {
      disposeSceneContents(scene, bodies);
      renderer.dispose();
    },
  };
}
