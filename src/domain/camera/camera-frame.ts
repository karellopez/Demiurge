/**
 * Where the camera goes, for a given mode, body and moment.
 *
 * Pure: given a body's position, the star's position, a mode and the player's
 * drag, this computes an f64 world position and a look-at point. Nothing here
 * knows about three.js, which is what lets every mode's geometry be tested
 * against arithmetic rather than against a screenshot.
 *
 * Distance is expressed in **body radii**, not metres, because that is the only
 * unit under which one number means the same thing at Phobos and at Jupiter.
 * Thirty radii frames a body nicely whether it is eleven kilometres across or
 * seventy thousand.
 *
 * The scratch vectors live inside a framer rather than at module scope: this
 * runs every frame and must not allocate, but module-level mutable state is
 * banned outright, so the state is closed over by a factory instead. That is the
 * same shape as the frame-time window and the system propagator.
 *
 * @module
 */

import {
  addScaled,
  copy,
  createVec3,
  cross,
  lerp,
  normalize,
  set,
  subtract,
  type ReadonlyVec3,
  type Vec3,
} from '@shared/math/vec3';
import type { Meters, Radians } from '@shared/units';

import { CameraMode } from './camera-mode';

/** Closest the camera may sit to a surface, in body radii. Below this it clips. */
export const MIN_ORBIT_RADII = 1.05;

/** Furthest the camera pulls back, in body radii. */
export const MAX_ORBIT_RADII = 8000;

/** Where the camera starts when a body is selected, in body radii. */
export const DEFAULT_ORBIT_RADII = 30;

/** Seconds for the cinematic dolly to complete one slow lap. */
const CINEMATIC_PERIOD_SECONDS = 240;

/** How far above the equator the cinematic dolly rides, in radians. */
const CINEMATIC_ELEVATION = 0.28;

/** How far to one side of the star line the Sun-relative mode sits, in radians. */
const TERMINATOR_OFFSET = Math.PI / 2.35;

/** How closely the view may align with ecliptic north before the basis is rebuilt. */
const POLE_ALIGNMENT_LIMIT = 0.999;

/** Everything needed to place the camera. */
export interface CameraFrameInput {
  /** Which mode is active. */
  readonly mode: CameraMode;
  /** The followed body's position, in true heliocentric metres. */
  readonly bodyPosition: ReadonlyVec3;
  /** The star's position, for the Sun-relative mode. */
  readonly starPosition: ReadonlyVec3;
  /** The followed body's equatorial radius. */
  readonly bodyRadius: Meters;
  /** How far out the camera sits, in body radii. */
  readonly distanceRadii: number;
  /** Azimuth the player has dragged to. */
  readonly azimuth: Radians;
  /** Elevation the player has dragged to. */
  readonly elevation: Radians;
  /** The body's rotation angle now, for the locked frame. */
  readonly bodyRotation: Radians;
  /** Wall-clock seconds, for the cinematic dolly. */
  readonly wallClockSeconds: number;
}

/** Where the camera is and what it is pointed at, in true heliocentric metres. */
export interface CameraFrame {
  /** The camera's position. */
  readonly position: Vec3;
  /** The point it looks at. Always the followed body's centre. */
  readonly target: Vec3;
  /** Which way is up, so the horizon does not roll. */
  readonly up: Vec3;
}

/**
 * Allocates a camera frame.
 *
 * @returns A frame at the origin, with ecliptic north as up.
 */
export function createCameraFrame(): CameraFrame {
  return { position: createVec3(), target: createVec3(), up: createVec3(0, 0, 1) };
}

/**
 * Clamps an orbit distance into the range that neither clips nor loses the body.
 *
 * @param distanceRadii - The requested distance, in body radii.
 * @returns A distance inside the allowed range.
 */
export function clampOrbitDistance(distanceRadii: number): number {
  if (!Number.isFinite(distanceRadii)) {
    return DEFAULT_ORBIT_RADII;
  }
  return Math.min(MAX_ORBIT_RADII, Math.max(MIN_ORBIT_RADII, distanceRadii));
}

/**
 * Applies one notch of exponential zoom.
 *
 * Exponential rather than linear because the useful range spans four orders of
 * magnitude: a fixed step that feels right at eight radii is imperceptible at
 * eight thousand and buries the camera in the surface at two.
 *
 * @param distanceRadii - The current distance, in body radii.
 * @param notches - Wheel notches. Positive pulls back, negative moves in.
 * @returns The new distance, clamped.
 */
export function zoomOrbitDistance(distanceRadii: number, notches: number): number {
  return clampOrbitDistance(distanceRadii * 1.18 ** notches);
}

/**
 * Clamps elevation just short of the poles.
 *
 * Exactly at a pole the azimuth becomes undefined and the up vector degenerates,
 * which shows up as the view snapping through a right angle for one frame.
 *
 * @param elevation - The requested elevation, in radians.
 * @returns An elevation strictly inside the poles.
 */
export function clampElevation(elevation: number): number {
  if (!Number.isFinite(elevation)) {
    return 0;
  }
  const limit = Math.PI / 2 - 0.02;
  return Math.min(limit, Math.max(-limit, elevation));
}

/**
 * Computes the azimuth a mode wants, before the player's drag is added.
 *
 * This is the whole difference between the modes: each holds a different thing
 * still, and does it by choosing what the azimuth is measured against.
 *
 * @param input - The frame inputs.
 * @param starAzimuth - Direction from the body to the star, as an angle.
 * @returns The azimuth to place the camera at.
 */
function azimuthForMode(input: CameraFrameInput, starAzimuth: number): number {
  switch (input.mode) {
    case CameraMode.Orbit:
    case CameraMode.Inertial: {
      // Both are free of the body's spin. They differ in what the *renderer*
      // does with orientation, not in where the camera sits.
      return input.azimuth;
    }
    case CameraMode.Locked: {
      // Rides the rotating frame, so a surface feature stays put.
      return input.azimuth + input.bodyRotation;
    }
    case CameraMode.SunRelative: {
      // Held to one side of the star line, so the terminator stays in frame.
      return starAzimuth + TERMINATOR_OFFSET;
    }
    case CameraMode.Cinematic: {
      return input.azimuth + (input.wallClockSeconds / CINEMATIC_PERIOD_SECONDS) * Math.PI * 2;
    }
  }
}

/** Computes camera frames without allocating. */
export interface CameraFramer {
  /**
   * Places the camera for a mode.
   *
   * @param out - The frame to write into. Every vector is overwritten.
   * @param input - Where the body is, which mode is active, and the player's drag.
   * @returns `out`.
   */
  compute(out: CameraFrame, input: CameraFrameInput): CameraFrame;
}

/**
 * Creates a framer.
 *
 * @returns A framer with its own scratch vectors.
 */
export function createCameraFramer(): CameraFramer {
  // PERF: mutable for zero-alloc — written and consumed within a single call.
  const toStar = createVec3();
  const direction = createVec3();
  const forward = createVec3();
  const axis = createVec3();

  /**
   * Writes the camera's up vector.
   *
   * Ecliptic north, except when the view is almost straight down a pole, where
   * north and the view direction become parallel and the basis collapses. There
   * the up vector is swung into the view plane instead, which stops the roll
   * snapping as the player drags over the top.
   *
   * @param out - The vector to write into.
   * @param frame - The frame whose position and target are already written.
   */
  const writeUp = (out: Vec3, frame: CameraFrame): void => {
    subtract(forward, frame.target, frame.position);
    normalize(forward, forward);

    if (Math.abs(forward.z) < POLE_ALIGNMENT_LIMIT) {
      set(out, 0, 0, 1);
      return;
    }

    // Looking down a pole. Build an up vector perpendicular to the view, using
    // +x as the reference: the branch is only reached when the view is within
    // 2.6 degrees of the z axis, so +x is never close to parallel with it and
    // the cross product cannot degenerate.
    set(axis, 1, 0, 0);
    cross(out, forward, axis);
    cross(out, out, forward);
    normalize(out, out);
  };

  return {
    compute(out: CameraFrame, input: CameraFrameInput): CameraFrame {
      subtract(toStar, input.starPosition, input.bodyPosition);
      const starAzimuth = Math.atan2(toStar.y, toStar.x);

      const azimuth = azimuthForMode(input, starAzimuth);
      const elevation =
        input.mode === CameraMode.Cinematic ? CINEMATIC_ELEVATION : clampElevation(input.elevation);

      const horizontal = Math.cos(elevation);
      set(
        direction,
        Math.cos(azimuth) * horizontal,
        Math.sin(azimuth) * horizontal,
        Math.sin(elevation),
      );

      const distanceMeters = input.bodyRadius * clampOrbitDistance(input.distanceRadii);
      copy(out.target, input.bodyPosition);
      addScaled(out.position, input.bodyPosition, direction, distanceMeters);
      writeUp(out.up, out);
      return out;
    },
  };
}

/**
 * Copies one frame into another.
 *
 * @param out - The frame to write into.
 * @param source - The frame to copy.
 * @returns `out`.
 */
export function copyCameraFrame(out: CameraFrame, source: CameraFrame): CameraFrame {
  copy(out.position, source.position);
  copy(out.target, source.target);
  copy(out.up, source.up);
  return out;
}

/**
 * Interpolates between two camera frames.
 *
 * Used when the followed body changes, so the camera travels rather than
 * teleports.
 *
 * @param out - The frame to write into.
 * @param from - The frame at `t = 0`.
 * @param to - The frame at `t = 1`.
 * @param t - Progress, clamped into [0, 1].
 * @returns `out`.
 */
export function lerpCameraFrame(
  out: CameraFrame,
  from: CameraFrame,
  to: CameraFrame,
  t: number,
): CameraFrame {
  const progress = Math.min(1, Math.max(0, t));
  lerp(out.position, from.position, to.position, progress);
  lerp(out.target, from.target, to.target, progress);
  lerp(out.up, from.up, to.up, progress);
  return out;
}
