/**
 * The WebGL context and the camera that draws into it.
 *
 * Everything here is about the *surface* rather than the scene: how the depth
 * buffer is configured, how far the near and far planes sit, and how the drawing
 * buffer is kept matched to the canvas's displayed size.
 *
 * The near and far planes are the whole reason the logarithmic depth buffer is
 * switched on. A conventional buffer distributes its precision by `1/z`, so a
 * range from a centimetre to a hundred billion kilometres would spend essentially
 * all of it in the first metre and z-fight everywhere else. The logarithmic
 * buffer distributes precision by log depth instead, which is what makes one
 * camera able to frame a bolt on a hull and Neptune's orbit.
 *
 * @see docs/adr/0005-logarithmic-depth-buffer.md
 * @module
 */

import { Color, PerspectiveCamera, WebGLRenderer } from 'three';

/** Near plane, in metres. Close enough to stand on a surface. */
const NEAR_PLANE_METERS = 0.01;

/** Far plane, in metres. Past Eris at aphelion. */
const FAR_PLANE_METERS = 1e14;

/** Vertical field of view, in degrees. */
const FIELD_OF_VIEW_DEGREES = 50;

/** Highest device pixel ratio honoured. Beyond this the cost buys nothing. */
const MAX_PIXEL_RATIO = 2;

/** Background colour: not quite black, so the void reads as space rather than as a dead buffer. */
const CLEAR_COLOR = 0x03_04_07;

/**
 * Creates the renderer.
 *
 * @param canvas - The canvas to draw into.
 * @returns A configured WebGL renderer.
 */
export function createRenderer(canvas: HTMLCanvasElement): WebGLRenderer {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
    logarithmicDepthBuffer: true,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.setClearColor(new Color(CLEAR_COLOR), 1);
  return renderer;
}

/**
 * Creates the scene camera, oriented for the ecliptic frame.
 *
 * three.js assumes Y is up; the ecliptic frame's north pole is +Z. Telling the
 * camera so is what keeps `lookAt` from rolling the whole system onto its side.
 *
 * @returns A camera spanning the full depth range.
 */
export function createSceneCamera(): PerspectiveCamera {
  const camera = new PerspectiveCamera(
    FIELD_OF_VIEW_DEGREES,
    1,
    NEAR_PLANE_METERS,
    FAR_PLANE_METERS,
  );
  camera.up.set(0, 0, 1);
  return camera;
}

/**
 * Keeps the drawing buffer matched to the canvas's displayed size.
 *
 * @param renderer - The renderer to resize.
 * @param camera - The camera whose aspect ratio follows the canvas.
 * @param canvas - The canvas being displayed.
 */
export function resizeToCanvas(
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
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
