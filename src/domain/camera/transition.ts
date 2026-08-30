/**
 * Moving the camera from one body to another without a cut.
 *
 * Selecting Neptune while looking at Mercury is a jump of thirty astronomical
 * units. Teleporting is disorienting — the player loses all sense of where they
 * went — and travelling at constant speed is worse, because the first and last
 * seconds are a blur and the middle is empty. So the camera eases: slow at both
 * ends, quick through the middle, over a duration that grows with how far it has
 * to go but is bounded so a trip to Eris does not take a minute.
 *
 * Everything here is pure arithmetic on a progress value. The rig owns the clock.
 *
 * @module
 */

import { type Seconds, seconds } from '@shared/units';

/** Shortest a transition takes, however close the destination. */
export const MIN_TRANSITION_SECONDS = seconds(0.8);

/** Longest a transition takes, however far the destination. */
export const MAX_TRANSITION_SECONDS = seconds(2);

/** A transition in progress. */
export interface CameraTransition {
  /** How long the whole move takes. */
  readonly durationSeconds: Seconds;
  /** How much of it has elapsed. */
  readonly elapsedSeconds: Seconds;
}

/**
 * Chooses how long a move should take.
 *
 * Logarithmic in distance: the difference between one and ten astronomical units
 * matters, the difference between forty and fifty does not, and a linear rule
 * would spend the whole budget on the outer system.
 *
 * @param distanceMeters - How far the camera has to travel.
 * @param bodyRadiusMeters - The destination's radius, which sets the scale of
 *   "close". A move of a thousand kilometres is a long way at Phobos and nothing
 *   at Jupiter.
 * @returns A duration between the documented bounds.
 */
export function transitionDuration(distanceMeters: number, bodyRadiusMeters: number): Seconds {
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) {
    return MIN_TRANSITION_SECONDS;
  }

  const radii = distanceMeters / Math.max(1, bodyRadiusMeters);
  // Ten radii is "already here"; a million is "across the system".
  const decades = Math.log10(Math.max(1, radii)) / 6;
  const fraction = Math.min(1, Math.max(0, decades));
  return seconds(
    MIN_TRANSITION_SECONDS + (MAX_TRANSITION_SECONDS - MIN_TRANSITION_SECONDS) * fraction,
  );
}

/**
 * Eases progress so the move starts and ends gently.
 *
 * A smoothstep rather than a spring: a spring overshoots, and overshooting past
 * a planet and coming back reads as a mistake rather than as a flourish.
 *
 * @param t - Linear progress, clamped into [0, 1].
 * @returns Eased progress, also in [0, 1].
 */
export function easeInOut(t: number): number {
  const progress = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0;
  return progress * progress * (3 - 2 * progress);
}

/**
 * Starts a transition.
 *
 * @param durationSeconds - How long the move should take.
 * @returns A transition at zero progress.
 */
export function beginTransition(durationSeconds: Seconds): CameraTransition {
  return { durationSeconds, elapsedSeconds: seconds(0) };
}

/**
 * Advances a transition.
 *
 * @param transition - The transition so far.
 * @param deltaSeconds - Wall-clock time since the last frame.
 * @returns The advanced transition.
 */
export function advanceTransition(
  transition: CameraTransition,
  deltaSeconds: Seconds,
): CameraTransition {
  const elapsed = transition.elapsedSeconds + Math.max(0, deltaSeconds);
  return {
    durationSeconds: transition.durationSeconds,
    elapsedSeconds: seconds(Math.min(transition.durationSeconds, elapsed)),
  };
}

/**
 * Reads a transition's eased progress.
 *
 * @param transition - The transition to read.
 * @returns Eased progress in [0, 1]. A zero-length transition is complete at once.
 */
export function transitionProgress(transition: CameraTransition): number {
  if (transition.durationSeconds <= 0) {
    return 1;
  }
  return easeInOut(transition.elapsedSeconds / transition.durationSeconds);
}

/**
 * Reports whether a transition has finished.
 *
 * @param transition - The transition to inspect.
 * @returns True when no time remains.
 */
export function isTransitionComplete(transition: CameraTransition): boolean {
  return transition.elapsedSeconds >= transition.durationSeconds;
}
