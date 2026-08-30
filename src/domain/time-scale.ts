/**
 * Time warp: the ladder of multipliers and the rules for stepping it.
 *
 * A solar system is mostly waiting. Mercury takes 88 days to go round and
 * Neptune takes 165 years, so a simulator that only runs at 1x is a still life.
 * The ladder spans nine orders of magnitude, from paused to a year a second, and
 * the steps are named in units a person thinks in — "1 day/s" rather than
 * "86400x" — because nobody has an intuition for what 31 557 600 times real time
 * feels like.
 *
 * Every step has a mirror running backwards. Reversing time is not a novelty
 * here: it is how you check that an eclipse really did fall on the date the
 * simulation says, and the propagator is a closed-form function of time, so
 * running it backwards costs nothing and loses nothing.
 *
 * @module
 */

import { SECONDS_PER_DAY } from '@shared/units';

/** Seconds in a Julian year, the unit the top of the ladder is expressed in. */
const SECONDS_PER_JULIAN_YEAR = SECONDS_PER_DAY * 365.25;

/** Seconds in an average Gregorian month, for the middle of the ladder. */
const SECONDS_PER_MONTH = SECONDS_PER_JULIAN_YEAR / 12;

/** One rung of the time-warp ladder. */
export interface TimeScaleStep {
  /** Simulated seconds per wall-clock second. Zero pauses. */
  readonly multiplier: number;
  /** How the rung is written in the HUD. */
  readonly label: string;
}

/**
 * The ladder, slowest to fastest.
 *
 * Only the forward half is listed; the reverse half is the mirror of it, so a
 * rung cannot exist in one direction and not the other.
 */
export const TIME_SCALE_LADDER: readonly TimeScaleStep[] = [
  { multiplier: 0, label: 'paused' },
  { multiplier: 1, label: '1x' },
  { multiplier: 60, label: '60x' },
  { multiplier: 3600, label: '1 hour/s' },
  { multiplier: SECONDS_PER_DAY, label: '1 day/s' },
  { multiplier: SECONDS_PER_MONTH, label: '1 month/s' },
  { multiplier: SECONDS_PER_JULIAN_YEAR, label: '1 year/s' },
] as const;

/** Index of the paused rung. */
const PAUSED_INDEX = 0;

/** Index of `1x`, which is where a session starts and where `P` returns to. */
export const DEFAULT_TIME_SCALE_INDEX = 1;

/** Which way time is running. */
type TimeDirection = 'forward' | 'reverse';

/** A position on the ladder, in a direction. */
export interface TimeScaleState {
  /** Index into {@link TIME_SCALE_LADDER}. */
  readonly index: number;
  /** Which way time runs at that rung. */
  readonly direction: TimeDirection;
}

/** Where a session starts: real time, running forwards. */
export const INITIAL_TIME_SCALE: TimeScaleState = {
  index: DEFAULT_TIME_SCALE_INDEX,
  direction: 'forward',
};

/**
 * Reads the signed multiplier for a state.
 *
 * @param state - Position on the ladder.
 * @returns Simulated seconds per wall-clock second, negative when reversed.
 */
export function multiplierFor(state: TimeScaleState): number {
  const step = TIME_SCALE_LADDER[clampIndex(state.index)];
  const magnitude = step?.multiplier ?? 0;
  return state.direction === 'reverse' ? -magnitude : magnitude;
}

/**
 * Reads the HUD label for a state.
 *
 * @param state - Position on the ladder.
 * @returns A label such as `1 day/s` or `-60x`. Paused is never signed, because
 *   there is no such thing as paused backwards.
 */
export function labelFor(state: TimeScaleState): string {
  const step = TIME_SCALE_LADDER[clampIndex(state.index)];
  const label = step?.label ?? 'paused';
  if (step?.multiplier === 0) {
    return label;
  }
  return state.direction === 'reverse' ? `-${label}` : label;
}

/**
 * Clamps an index onto the ladder.
 *
 * @param index - Any integer.
 * @returns An index that exists.
 */
function clampIndex(index: number): number {
  return Math.min(TIME_SCALE_LADDER.length - 1, Math.max(0, Math.trunc(index)));
}

/**
 * Steps one rung faster.
 *
 * @param state - The current state.
 * @returns The next rung up, or the same state at the ceiling.
 */
export function faster(state: TimeScaleState): TimeScaleState {
  return { ...state, index: clampIndex(state.index + 1) };
}

/**
 * Steps one rung slower.
 *
 * @param state - The current state.
 * @returns The next rung down, or paused at the floor.
 */
export function slower(state: TimeScaleState): TimeScaleState {
  return { ...state, index: clampIndex(state.index - 1) };
}

/**
 * Reverses the direction of time, keeping the rate.
 *
 * @param state - The current state.
 * @returns The same rung, running the other way.
 */
export function reversed(state: TimeScaleState): TimeScaleState {
  return { ...state, direction: state.direction === 'forward' ? 'reverse' : 'forward' };
}

/**
 * Toggles between paused and the last running rate.
 *
 * Pausing has to remember where it was, or every pause costs the player their
 * place on a nine-decade ladder. When already paused this returns to `resumeTo`;
 * when running it pauses.
 *
 * @param state - The current state.
 * @param resumeTo - The rung to return to when unpausing.
 * @returns The toggled state.
 */
export function togglePause(state: TimeScaleState, resumeTo: number): TimeScaleState {
  const isPaused = state.index === PAUSED_INDEX;
  return { ...state, index: isPaused ? clampIndex(resumeTo) : PAUSED_INDEX };
}

/**
 * Reports whether time is stopped.
 *
 * @param state - The state to inspect.
 * @returns True when no simulated time passes.
 */
export function isPaused(state: TimeScaleState): boolean {
  return multiplierFor(state) === 0;
}
