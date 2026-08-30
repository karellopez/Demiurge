/**
 * The fixed-step accumulator that makes the simulation reproducible.
 *
 * Rendering happens whenever the browser feels like it; physics must not. If the
 * integrator advanced by the wall-clock delta, the same seed would produce a
 * different trajectory on a 144 Hz monitor than on a 60 Hz one, and a dropped
 * frame would change where a ship ends up. So the simulation advances in fixed
 * 120 Hz steps, and the renderer interpolates between the last two.
 *
 * The subtle part is what to do when the browser stops delivering frames — the
 * tab was hidden, the user dragged the window, a shader compiled. The
 * accumulator fills with a large debt, the loop tries to pay it off in one
 * frame, that frame takes even longer, and the debt grows: the spiral of death.
 * The guard is to cap the substeps and *discard* the remaining debt rather than
 * carry it. The simulation then quietly runs slow for one frame, which nobody
 * notices, instead of locking the tab, which everybody does.
 *
 * This module is pure. It computes a plan; it does not step anything.
 *
 * @module
 */

import { type Seconds, seconds } from '@shared/units';

/** The simulation's fixed timestep: 120 Hz. */
export const FIXED_STEP_SECONDS = seconds(1 / 120);

/** Most substeps allowed in one frame before the remaining debt is discarded. */
export const MAX_SUBSTEPS = 5;

/** How one frame's worth of time should be spent. */
export interface StepPlan {
  /** How many fixed steps to run this frame. Never more than {@link MAX_SUBSTEPS}. */
  readonly steps: number;
  /** Time left over, carried into the next frame. Always less than one step. */
  readonly carrySeconds: Seconds;
  /**
   * Simulated time abandoned to stop a spiral of death. Non-zero means the frame
   * arrived too late to catch up, and the simulation deliberately fell behind.
   */
  readonly droppedSeconds: Seconds;
  /**
   * How far the render should interpolate between the last completed step and
   * the next one, in [0, 1). This is what keeps motion smooth when the display
   * refresh and the simulation rate do not divide evenly.
   */
  readonly interpolationAlpha: number;
}

/** Everything `planSteps` needs to decide. */
export interface StepPlanInput {
  /** Time carried over from the previous frame. */
  readonly carrySeconds: Seconds;
  /** Wall-clock time since the previous frame. */
  readonly frameDeltaSeconds: Seconds;
  /** The fixed timestep. Injected so tests can use round numbers. */
  readonly fixedStepSeconds?: Seconds;
  /** The substep cap. Injected so the spiral guard can be tested directly. */
  readonly maxSubsteps?: number;
}

/**
 * Decides how many fixed steps this frame should run.
 *
 * Pure: the same inputs always produce the same plan, which is what lets the
 * spiral-of-death guard be tested without a browser or a clock.
 *
 * @param input - The carried time, the frame delta, and optional overrides.
 * @returns The plan for this frame.
 */
export function planSteps(input: StepPlanInput): StepPlan {
  const fixedStep = input.fixedStepSeconds ?? FIXED_STEP_SECONDS;
  const maxSubsteps = input.maxSubsteps ?? MAX_SUBSTEPS;

  // A negative delta means the clock went backwards, which some virtualised
  // environments do. Treat it as a stalled frame rather than rewinding physics.
  // There is deliberately no upper clamp here: the substep cap below is the only
  // catch-up policy, and a second, hidden limit would quietly override it.
  const delta = Math.max(0, input.frameDeltaSeconds);
  const available = input.carrySeconds + delta;

  const wantedSteps = Math.floor(available / fixedStep);
  const steps = Math.min(wantedSteps, maxSubsteps);
  const consumed = steps * fixedStep;

  // What is left once every step the accumulator *wanted* has been taken. This
  // is the honest carry, and it is always shorter than one step.
  const subStepRemainder = available - wantedSteps * fixedStep;

  // Everything between what we ran and what we wanted is debt we have chosen not
  // to repay. Computed by subtraction rather than a modulo so that a 600-second
  // delta does not leave a rounding artefact behind.
  const isBehind = wantedSteps > maxSubsteps;
  const dropped = isBehind ? available - consumed - subStepRemainder : 0;
  const carry = isBehind ? subStepRemainder : available - consumed;

  return {
    steps,
    carrySeconds: seconds(carry),
    droppedSeconds: seconds(dropped),
    interpolationAlpha: carry / fixedStep,
  };
}

/**
 * Advances simulation time by a whole number of fixed steps.
 *
 * @param simTimeSeconds - Current simulation time, in seconds since J2000.
 * @param steps - How many fixed steps to advance.
 * @param timeScale - The player's time multiplier. May be negative to run time backwards.
 * @param fixedStepSeconds - The fixed timestep.
 * @returns The new simulation time.
 */
export function advanceSimTime(
  simTimeSeconds: Seconds,
  steps: number,
  timeScale: number,
  fixedStepSeconds: Seconds = FIXED_STEP_SECONDS,
): Seconds {
  return seconds(simTimeSeconds + steps * fixedStepSeconds * timeScale);
}
