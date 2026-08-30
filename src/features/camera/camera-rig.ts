/**
 * The camera rig: one rig, pluggable behaviours.
 *
 * Holds what the player has chosen — which body, which mode, how far out, which
 * way they have dragged — and turns that into a camera frame each render. The
 * geometry lives in `domain/camera/`; the state and its transitions live in
 * {@link ./rig-state}; this file is the handle the rest of the app drives.
 *
 * Two things it guarantees, both of which are phase-3 acceptance criteria:
 *
 * - **Nothing snaps.** Selecting a new body starts a timed transition and the
 *   camera interpolates from where it actually was, not from where the previous
 *   body has since moved to. Selecting during a transition re-aims from the
 *   current interpolated position, so rapid clicking never teleports.
 * - **Nothing clips.** The orbit distance is in body radii and clamped above the
 *   surface, so the camera cannot end up inside a planet at any zoom or scale.
 *
 * @module
 */

import type { Body } from '@domain/body';
import {
  clampElevation,
  clampOrbitDistance,
  copyCameraFrame,
  createCameraFramer,
  zoomOrbitDistance,
  type CameraFrame,
} from '@domain/camera/camera-frame';
import { nextAvailableCameraMode, type CameraMode } from '@domain/camera/camera-mode';
import { radians, type Seconds } from '@shared/units';

import {
  advanceRig,
  createRigState,
  selectBody,
  stepBody,
  type CameraRigOptions,
} from './rig-state';

export type { BodyPositions, CameraRigOptions } from './rig-state';

/** The rig's observable state, for the HUD. */
export interface CameraRigState {
  /** The body being followed. */
  readonly body: Body;
  /** The active mode. */
  readonly mode: CameraMode;
  /** How far out the camera sits, in body radii. */
  readonly distanceRadii: number;
  /** Whether a transition is in progress. */
  readonly isTransitioning: boolean;
}

/** The camera rig. */
export interface CameraRig {
  /**
   * Advances the rig and writes the camera frame for this render.
   *
   * @param out - The frame to write into.
   * @param deltaSeconds - Wall-clock time since the last render.
   * @param wallClockSeconds - Wall-clock time, for the cinematic dolly.
   * @returns `out`.
   */
  update(out: CameraFrame, deltaSeconds: Seconds, wallClockSeconds: number): CameraFrame;

  /**
   * Follows a different body, travelling rather than cutting.
   *
   * @param bodyId - The body to follow. Unknown ids are ignored.
   */
  select(bodyId: string): void;

  /** Cycles to the next mode that is meaningful for the followed body. */
  cycleMode(): void;

  /**
   * Follows the next body along the catalogue, wrapping at either end.
   *
   * @param step - How many places to move. Negative walks back.
   */
  cycleBody(step: number): void;

  /**
   * Zooms by whole notches.
   *
   * @param notches - Positive pulls back, negative moves in.
   */
  zoom(notches: number): void;

  /**
   * Drags the view around the body.
   *
   * @param deltaAzimuth - Change in azimuth, in radians.
   * @param deltaElevation - Change in elevation, in radians.
   */
  orbitBy(deltaAzimuth: number, deltaElevation: number): void;

  /**
   * Reads the rig's current state.
   *
   * @returns What the HUD needs to show.
   */
  state(): CameraRigState;
}

/**
 * Creates the rig.
 *
 * @param options - The catalogue, the positions, and where to start.
 * @returns A rig following the initial body.
 * @throws {Error} When the initial body is not in the catalogue.
 */
export function createCameraRig(options: CameraRigOptions): CameraRig {
  const { catalog } = options;

  const initial = catalog.byId(options.initialBodyId);
  if (initial === undefined) {
    throw new Error(`Cannot start the camera on "${options.initialBodyId}": no such body.`);
  }

  const framer = createCameraFramer();
  const state = createRigState(initial);

  return {
    update(out: CameraFrame, deltaSeconds: Seconds, wallClockSeconds: number): CameraFrame {
      return copyCameraFrame(
        out,
        advanceRig(state, options, framer, { deltaSeconds, wallClockSeconds }),
      );
    },

    select(bodyId: string): void {
      selectBody(state, options, bodyId);
    },

    cycleMode(): void {
      state.mode = nextAvailableCameraMode(state.mode, state.followed.id === catalog.root.id);
    },

    cycleBody(step: number): void {
      stepBody(state, options, step);
    },

    zoom(notches: number): void {
      state.distanceRadii = zoomOrbitDistance(state.distanceRadii, notches);
    },

    orbitBy(deltaAzimuth: number, deltaElevation: number): void {
      state.azimuth = radians(state.azimuth + deltaAzimuth);
      state.elevation = radians(clampElevation(state.elevation + deltaElevation));
    },

    state(): CameraRigState {
      return {
        body: state.followed,
        mode: state.mode,
        distanceRadii: clampOrbitDistance(state.distanceRadii),
        isTransitioning: state.transition !== undefined,
      };
    },
  };
}
