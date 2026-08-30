import { describe, expect, it } from 'vitest';

import {
  MAX_TRANSITION_SECONDS,
  MIN_TRANSITION_SECONDS,
  advanceTransition,
  beginTransition,
  easeInOut,
  isTransitionComplete,
  transitionDuration,
  transitionProgress,
} from '@domain/camera/transition';
import { seconds } from '@shared/units';

describe('how long a move takes', () => {
  it('is bounded at both ends, so nothing is instant and nothing drags', () => {
    expect(MIN_TRANSITION_SECONDS).toBeCloseTo(0.8, 12);
    expect(MAX_TRANSITION_SECONDS).toBeCloseTo(2, 12);
  });

  it('takes exactly the minimum for a body the camera is already at', () => {
    expect(transitionDuration(6_378_137, 6_378_137)).toBe(MIN_TRANSITION_SECONDS);
  });

  it('barely exceeds the minimum for a body already in frame', () => {
    // Five radii is a small move, not no move, so it costs a little more than
    // the floor - but nowhere near the ceiling.
    const duration = transitionDuration(6_378_137 * 5, 6_378_137);
    expect(duration).toBeGreaterThan(MIN_TRANSITION_SECONDS);
    expect(duration).toBeLessThan(MIN_TRANSITION_SECONDS + 0.2);
  });

  it('takes longer for a body further away', () => {
    const near = transitionDuration(6_378_137 * 100, 6_378_137);
    const far = transitionDuration(6_378_137 * 100_000, 6_378_137);
    expect(far).toBeGreaterThan(near);
  });

  it('never exceeds the ceiling, however far the destination', () => {
    expect(transitionDuration(1e14, 1000)).toBeLessThanOrEqual(MAX_TRANSITION_SECONDS);
  });

  it('measures distance in body radii, so one rule fits Phobos and Jupiter', () => {
    // The same number of radii should take the same time whatever the body.
    const atPhobos = transitionDuration(11_267 * 1000, 11_267);
    const atJupiter = transitionDuration(71_492_000 * 1000, 71_492_000);
    expect(atPhobos).toBeCloseTo(atJupiter, 9);
  });

  it('falls back to the minimum for a nonsensical distance', () => {
    expect(transitionDuration(NaN, 1000)).toBe(MIN_TRANSITION_SECONDS);
    expect(transitionDuration(-5, 1000)).toBe(MIN_TRANSITION_SECONDS);
  });
});

describe('easing', () => {
  it('starts at nothing and ends at everything', () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
  });

  it('is halfway across at halfway through', () => {
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 12);
  });

  it('starts and ends gently', () => {
    // The first and last tenth cover far less than a tenth of the distance.
    expect(easeInOut(0.1)).toBeLessThan(0.05);
    expect(easeInOut(0.9)).toBeGreaterThan(0.95);
  });

  it('never overshoots, so the camera does not sail past the planet', () => {
    for (let step = 0; step <= 40; step += 1) {
      const eased = easeInOut(step / 40);
      expect(eased).toBeGreaterThanOrEqual(0);
      expect(eased).toBeLessThanOrEqual(1);
    }
  });

  it('increases all the way across', () => {
    let previous = -1;
    for (let step = 0; step <= 40; step += 1) {
      const eased = easeInOut(step / 40);
      expect(eased).toBeGreaterThanOrEqual(previous);
      previous = eased;
    }
  });

  it('clamps rather than extrapolating', () => {
    expect(easeInOut(-3)).toBe(0);
    expect(easeInOut(4)).toBe(1);
    expect(easeInOut(NaN)).toBe(0);
  });
});

describe('running a transition', () => {
  it('starts at no progress', () => {
    expect(transitionProgress(beginTransition(seconds(1)))).toBe(0);
  });

  it('advances with the clock', () => {
    const halfway = advanceTransition(beginTransition(seconds(1)), seconds(0.5));
    expect(transitionProgress(halfway)).toBeCloseTo(0.5, 9);
  });

  it('finishes rather than running past its duration', () => {
    const overrun = advanceTransition(beginTransition(seconds(1)), seconds(10));
    expect(transitionProgress(overrun)).toBe(1);
    expect(isTransitionComplete(overrun)).toBe(true);
  });

  it('is not complete partway through', () => {
    expect(isTransitionComplete(advanceTransition(beginTransition(seconds(1)), seconds(0.5)))).toBe(
      false,
    );
  });

  it('ignores a backwards clock rather than rewinding', () => {
    const started = advanceTransition(beginTransition(seconds(1)), seconds(0.5));
    const rewound = advanceTransition(started, seconds(-10));
    expect(transitionProgress(rewound)).toBeCloseTo(transitionProgress(started), 9);
  });

  it('treats a zero-length transition as already finished', () => {
    const instant = beginTransition(seconds(0));
    expect(transitionProgress(instant)).toBe(1);
    expect(isTransitionComplete(instant)).toBe(true);
  });

  it('keeps its duration as it advances', () => {
    const advanced = advanceTransition(beginTransition(seconds(1.5)), seconds(0.2));
    expect(advanced.durationSeconds).toBe(1.5);
  });
});

describe('what a transition does with nonsense', () => {
  it('falls back to the shortest move for a distance that is not a number', () => {
    // Without the guard the fraction comes out NaN and the duration with it,
    // which advances a transition that can never complete.
    expect(transitionDuration(NaN, 1e6)).toBe(MIN_TRANSITION_SECONDS);
    expect(transitionDuration(Infinity, 1e6)).toBe(MIN_TRANSITION_SECONDS);
  });

  it('falls back to the shortest move for a distance of zero or less', () => {
    expect(transitionDuration(0, 1e6)).toBe(MIN_TRANSITION_SECONDS);
    expect(transitionDuration(-1e9, 1e6)).toBe(MIN_TRANSITION_SECONDS);
  });
});

describe('progress within a transition', () => {
  it('is the elapsed fraction of the duration, not the product of the two', () => {
    // A two-second move one second in is halfway, and smoothstep leaves the
    // midpoint alone.
    expect(transitionProgress({ durationSeconds: seconds(2), elapsedSeconds: seconds(1) })).toBe(
      0.5,
    );
  });

  it('reads a quarter of the way through a four-second move as a quarter', () => {
    expect(
      transitionProgress({ durationSeconds: seconds(4), elapsedSeconds: seconds(1) }),
    ).toBeCloseTo(easeInOut(0.25), 12);
  });
});
