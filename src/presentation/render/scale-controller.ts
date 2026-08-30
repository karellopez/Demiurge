/**
 * The scale transition, and the body resizing it implies.
 *
 * Split out of the scene because it is a small state machine with a clock, and
 * leaving it inline made the scene factory a place where two unrelated things
 * happened to be initialised next to each other.
 *
 * The transition is 1.5 seconds and geometric, so a jump from true scale to the
 * textbook diagram sweeps evenly through two orders of magnitude rather than
 * looking still and then lurching.
 *
 * @module
 */

import { flattening } from '@domain/body';
import { interpolateScale, TRUE_SCALE, type ScaleSettings } from '@domain/scale';

import type { SolarSystemVisuals } from './solar-system-scene';

/** Seconds a scale change takes to play out, rather than snapping. */
const SCALE_TRANSITION_SECONDS = 1.5;

/** Runs the scale transition and keeps the meshes sized to match. */
export interface ScaleController {
  /**
   * Advances the transition and resizes the body meshes.
   *
   * @param deltaSeconds - Wall-clock time since the last render.
   */
  advance(deltaSeconds: number): void;
  /**
   * Starts a move to new settings.
   *
   * @param target - The exaggeration to move to.
   */
  setTarget(target: ScaleSettings): void;
  /**
   * Reads the settings in force this frame.
   *
   * @returns The applied scale.
   */
  current(): ScaleSettings;
}

/**
 * Creates the controller.
 *
 * @param visuals - The bodies whose meshes are resized as the scale changes.
 * @returns A controller sitting at true scale.
 */
export function createScaleController(visuals: SolarSystemVisuals): ScaleController {
  let applied: ScaleSettings = TRUE_SCALE;
  let from: ScaleSettings = TRUE_SCALE;
  let to: ScaleSettings = TRUE_SCALE;
  let elapsed = SCALE_TRANSITION_SECONDS;

  return {
    advance(deltaSeconds: number): void {
      if (elapsed >= SCALE_TRANSITION_SECONDS) {
        return;
      }
      elapsed = Math.min(SCALE_TRANSITION_SECONDS, elapsed + deltaSeconds);
      applied = interpolateScale(from, to, elapsed / SCALE_TRANSITION_SECONDS);

      for (const visual of visuals.visuals) {
        // The mesh carries its oblateness in the y axis; multiply through rather
        // than overwrite, or Saturn becomes a sphere at any scale but true.
        const squash = 1 - flattening(visual.body);
        visual.mesh.scale.set(applied.sizeScale, applied.sizeScale * squash, applied.sizeScale);
      }
    },

    setTarget(target: ScaleSettings): void {
      from = applied;
      to = target;
      elapsed = 0;
    },

    current(): ScaleSettings {
      return applied;
    },
  };
}
