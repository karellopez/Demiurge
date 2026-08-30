/**
 * The camera rig's state, and the free functions that advance it.
 *
 * Kept as a plain record with functions operating on it — the same shape the
 * engine uses — so the factory in {@link ./camera-rig} stays a wiring step
 * rather than a place where a hundred lines of behaviour happen to be closed
 * over, and so each step can be tested by handing it a state.
 *
 * The geometry all lives in `domain/camera/`. What is here is the part that has
 * memory: which body is followed, where the camera was when the last transition
 * started, and how far through that transition it is.
 *
 * @module
 */

import type { Body, BodyCatalog } from '@domain/body';
import {
  copyCameraFrame,
  createCameraFrame,
  DEFAULT_ORBIT_RADII,
  lerpCameraFrame,
  type CameraFrame,
  type CameraFramer,
} from '@domain/camera/camera-frame';
import { CameraMode, isModeAvailable } from '@domain/camera/camera-mode';
import {
  advanceTransition,
  beginTransition,
  isTransitionComplete,
  transitionDuration,
  transitionProgress,
  type CameraTransition,
} from '@domain/camera/transition';
import { createVec3, distance, type Vec3 } from '@shared/math/vec3';
import { radians, seconds, type Radians, type Seconds } from '@shared/units';

/** Where every body is, right now. Supplied by the space feature each frame. */
export interface BodyPositions {
  /**
   * Reads a body's heliocentric position, in true metres.
   *
   * @param bodyId - The body to look up.
   * @param out - The vector to write into.
   * @returns `out`.
   */
  readPosition(bodyId: string, out: Vec3): Vec3;
}

/** What the rig needs to exist. */
export interface CameraRigOptions {
  /** The bodies that can be followed. */
  readonly catalog: BodyCatalog;
  /** Where those bodies currently are. */
  readonly positions: BodyPositions;
  /** Which body to start on. */
  readonly initialBodyId: string;
}

/** The rig's mutable state. */
export interface RigState {
  /** The body being followed. */
  followed: Body;
  /** The active mode. */
  mode: CameraMode;
  /** How far out the camera sits, in body radii. */
  distanceRadii: number;
  /** The player's accumulated horizontal drag. */
  azimuth: Radians;
  /** The player's accumulated vertical drag, clamped short of the poles. */
  elevation: Radians;
  /** The transition in progress, or `undefined` when the camera has settled. */
  transition: CameraTransition | undefined;
  /** Whether a frame has been produced yet. */
  hasRendered: boolean;
  /** Scratch, all written every frame. */
  readonly scratch: {
    /** The followed body's position. */
    readonly bodyPosition: Vec3;
    /** The star's position, for the sun-relative mode. */
    readonly starPosition: Vec3;
    /** Where the current settings say the camera belongs. */
    readonly desired: CameraFrame;
    /** Where the camera was when the current transition began. */
    readonly departure: CameraFrame;
    /** Where the camera actually is this frame. */
    readonly current: CameraFrame;
  };
}

/**
 * Creates the rig's initial state.
 *
 * @param initial - The body to start on.
 * @returns Fresh state, not yet rendered.
 */
export function createRigState(initial: Body): RigState {
  return {
    followed: initial,
    mode: CameraMode.Orbit,
    distanceRadii: DEFAULT_ORBIT_RADII,
    azimuth: radians(0.6),
    elevation: radians(0.35),
    transition: undefined,
    hasRendered: false,
    scratch: {
      // PERF: mutable for zero-alloc — all written every frame.
      bodyPosition: createVec3(),
      starPosition: createVec3(),
      desired: createCameraFrame(),
      departure: createCameraFrame(),
      current: createCameraFrame(),
    },
  };
}

/**
 * Writes the frame the current settings ask for, ignoring any transition.
 *
 * @param state - The rig's state.
 * @param options - The catalogue and the positions.
 * @param framer - The frame computer.
 * @param wallClockSeconds - Wall-clock time, for the cinematic dolly.
 */
function writeDesired(
  state: RigState,
  options: CameraRigOptions,
  framer: CameraFramer,
  wallClockSeconds: number,
): void {
  const { bodyPosition, starPosition, desired } = state.scratch;
  options.positions.readPosition(state.followed.id, bodyPosition);
  options.positions.readPosition(options.catalog.root.id, starPosition);

  framer.compute(desired, {
    mode: state.mode,
    bodyPosition,
    starPosition,
    bodyRadius: state.followed.equatorialRadius,
    distanceRadii: state.distanceRadii,
    azimuth: state.azimuth,
    elevation: state.elevation,
    // The renderer applies the body's rotation; the locked frame only needs the
    // angle, and phase 4 supplies the real one from the IAU model.
    bodyRotation: radians(0),
    wallClockSeconds,
  });
}

/**
 * Advances the rig by one render and writes the frame.
 *
 * @param state - The rig's state, advanced in place.
 * @param options - The catalogue and the positions.
 * @param framer - The frame computer.
 * @param timing - The frame delta and the wall clock.
 * @param timing.deltaSeconds - Wall-clock time since the last render.
 * @param timing.wallClockSeconds - Wall-clock time, for the cinematic dolly.
 * @returns The frame to render.
 */
export function advanceRig(
  state: RigState,
  options: CameraRigOptions,
  framer: CameraFramer,
  timing: { deltaSeconds: Seconds; wallClockSeconds: number },
): CameraFrame {
  writeDesired(state, options, framer, timing.wallClockSeconds);
  const { desired, departure, current } = state.scratch;

  if (!state.hasRendered) {
    // First frame: start where the settings say, rather than easing in from the
    // origin, which would fly the camera in from the Sun on every load.
    state.hasRendered = true;
    return copyCameraFrame(current, desired);
  }

  if (state.transition === undefined) {
    return copyCameraFrame(current, desired);
  }

  state.transition = advanceTransition(state.transition, timing.deltaSeconds);
  lerpCameraFrame(current, departure, desired, transitionProgress(state.transition));
  if (isTransitionComplete(state.transition)) {
    state.transition = undefined;
  }
  return current;
}

/**
 * Points the rig at a different body.
 *
 * @param state - The rig's state, advanced in place.
 * @param options - The catalogue and the positions.
 * @param bodyId - The body to follow. Unknown ids are ignored.
 */
export function selectBody(state: RigState, options: CameraRigOptions, bodyId: string): void {
  const next = options.catalog.byId(bodyId);
  if (next === undefined || next.id === state.followed.id) {
    return;
  }

  // Leave from where the camera actually is, which during a transition is
  // partway along the previous one. Without this, clicking two bodies in quick
  // succession snaps back to the first body's position.
  copyCameraFrame(state.scratch.departure, state.scratch.current);

  state.followed = next;
  state.distanceRadii = DEFAULT_ORBIT_RADII;
  if (!isModeAvailable(state.mode, next.id === options.catalog.root.id)) {
    state.mode = CameraMode.Orbit;
  }

  options.positions.readPosition(next.id, state.scratch.bodyPosition);
  state.transition = beginTransition(
    state.hasRendered
      ? transitionDuration(
          distance(state.scratch.departure.position, state.scratch.bodyPosition),
          next.equatorialRadius,
        )
      : seconds(0),
  );
}

/**
 * Moves the followed body along the catalogue by one or more places.
 *
 * Walks tree order — a planet followed by its own moons — because that is the
 * order the body list displays, and a key that visits bodies in a different
 * order from the list on screen is a key nobody can predict. Wrapping at each
 * end means neither direction ever dead-ends.
 *
 * @param state - The rig's state, advanced in place.
 * @param options - The catalogue and the positions.
 * @param step - How many places to move. Negative walks back.
 */
export function stepBody(state: RigState, options: CameraRigOptions, step: number): void {
  const bodies = options.catalog.inTreeOrder;
  const current = bodies.findIndex((body) => body.id === state.followed.id);
  const count = bodies.length;
  const next = bodies[(((current + step) % count) + count) % count];
  if (next !== undefined) {
    selectBody(state, options, next.id);
  }
}
