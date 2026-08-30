import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TIME_SCALE_INDEX,
  INITIAL_TIME_SCALE,
  TIME_SCALE_LADDER,
  faster,
  isPaused,
  labelFor,
  multiplierFor,
  reversed,
  slower,
  togglePause,
  type TimeScaleState,
} from '@domain/time-scale';

/** Seconds in a day, for readability in the expectations below. */
const DAY = 86_400;

describe('the ladder', () => {
  it('starts paused and ends at a year a second', () => {
    expect(TIME_SCALE_LADDER[0]?.multiplier).toBe(0);
    expect(TIME_SCALE_LADDER.at(-1)?.label).toBe('1 year/s');
  });

  it('increases strictly from one rung to the next', () => {
    for (let index = 1; index < TIME_SCALE_LADDER.length; index += 1) {
      expect(TIME_SCALE_LADDER[index]!.multiplier).toBeGreaterThan(
        TIME_SCALE_LADDER[index - 1]!.multiplier,
      );
    }
  });

  it('names its rungs in units a person thinks in', () => {
    const labels = TIME_SCALE_LADDER.map((step) => step.label);
    expect(labels).toContain('1 day/s');
    expect(labels).toContain('1 month/s');
    expect(labels).toContain('1 year/s');
  });

  it('puts a day a second at 86400 times real time', () => {
    const dayPerSecond = TIME_SCALE_LADDER.find((step) => step.label === '1 day/s');
    expect(dayPerSecond?.multiplier).toBe(DAY);
  });

  it('starts a session at real time, running forwards', () => {
    expect(INITIAL_TIME_SCALE).toStrictEqual({
      index: DEFAULT_TIME_SCALE_INDEX,
      direction: 'forward',
    });
    expect(multiplierFor(INITIAL_TIME_SCALE)).toBe(1);
  });
});

describe('reading a state', () => {
  it('reports the rung multiplier when running forwards', () => {
    expect(multiplierFor({ index: 2, direction: 'forward' })).toBe(60);
  });

  it('negates the multiplier when running backwards', () => {
    expect(multiplierFor({ index: 2, direction: 'reverse' })).toBe(-60);
  });

  it('clamps an index off the end of the ladder', () => {
    expect(multiplierFor({ index: 999, direction: 'forward' })).toBe(
      TIME_SCALE_LADDER.at(-1)?.multiplier,
    );
    expect(multiplierFor({ index: -5, direction: 'forward' })).toBe(0);
  });

  it('labels a forward rate plainly', () => {
    expect(labelFor({ index: 2, direction: 'forward' })).toBe('60x');
  });

  it('signs a reversed rate', () => {
    expect(labelFor({ index: 2, direction: 'reverse' })).toBe('-60x');
  });

  it('never signs paused, because there is no paused backwards', () => {
    expect(labelFor({ index: 0, direction: 'reverse' })).toBe('paused');
    expect(labelFor({ index: 0, direction: 'forward' })).toBe('paused');
  });
});

describe('stepping the ladder', () => {
  it('goes one rung faster', () => {
    expect(faster({ index: 1, direction: 'forward' }).index).toBe(2);
  });

  it('goes one rung slower', () => {
    expect(slower({ index: 2, direction: 'forward' }).index).toBe(1);
  });

  it('stops at the ceiling rather than running off the end', () => {
    const top = TIME_SCALE_LADDER.length - 1;
    expect(faster({ index: top, direction: 'forward' }).index).toBe(top);
  });

  it('stops at paused rather than going below it', () => {
    expect(slower({ index: 0, direction: 'forward' }).index).toBe(0);
  });

  it('keeps the direction while changing the rate', () => {
    expect(faster({ index: 1, direction: 'reverse' }).direction).toBe('reverse');
    expect(slower({ index: 3, direction: 'reverse' }).direction).toBe('reverse');
  });
});

describe('reversing', () => {
  it('turns forwards into backwards and back again', () => {
    const forward: TimeScaleState = { index: 3, direction: 'forward' };
    expect(reversed(forward).direction).toBe('reverse');
    expect(reversed(reversed(forward))).toStrictEqual(forward);
  });

  it('keeps the rate', () => {
    expect(reversed({ index: 4, direction: 'forward' }).index).toBe(4);
  });

  it('is available at every rung, so no rate exists in only one direction', () => {
    for (const index of TIME_SCALE_LADDER.keys()) {
      const state: TimeScaleState = { index, direction: 'forward' };
      expect(Math.abs(multiplierFor(reversed(state)))).toBe(multiplierFor(state));
    }
  });
});

describe('pausing', () => {
  it('stops time', () => {
    expect(isPaused(togglePause({ index: 4, direction: 'forward' }, 4))).toBe(true);
  });

  it('returns to where it was, so a pause does not cost the player their place', () => {
    const running: TimeScaleState = { index: 5, direction: 'forward' };
    const paused = togglePause(running, running.index);
    expect(togglePause(paused, 5)).toStrictEqual(running);
  });

  it('keeps the direction across a pause', () => {
    const reversedState: TimeScaleState = { index: 3, direction: 'reverse' };
    const paused = togglePause(reversedState, 3);
    expect(paused.direction).toBe('reverse');
    expect(togglePause(paused, 3)).toStrictEqual(reversedState);
  });

  it('reports paused for a zero multiplier in either direction', () => {
    expect(isPaused({ index: 0, direction: 'forward' })).toBe(true);
    expect(isPaused({ index: 0, direction: 'reverse' })).toBe(true);
  });

  it('reports running for any non-zero rate', () => {
    expect(isPaused({ index: 1, direction: 'forward' })).toBe(false);
    expect(isPaused({ index: 1, direction: 'reverse' })).toBe(false);
  });

  it('clamps a nonsense resume target onto the ladder', () => {
    expect(togglePause({ index: 0, direction: 'forward' }, 999).index).toBe(
      TIME_SCALE_LADDER.length - 1,
    );
  });
});

describe('a corrupted state', () => {
  it('reads as paused rather than as NaN times real time', () => {
    // A restored session could carry any number here. `Math.trunc(NaN)` is NaN
    // and every clamp leaves it NaN, so the lookup misses and the fallback runs.
    // Silently pausing beats multiplying simulated time by NaN, which would put
    // every body at an undefined position with no obvious cause.
    expect(multiplierFor({ index: NaN, direction: 'forward' })).toBe(0);
  });

  it('labels a corrupted state as paused', () => {
    expect(labelFor({ index: NaN, direction: 'forward' })).toBe('paused');
  });

  it('reports a corrupted state as paused', () => {
    expect(isPaused({ index: NaN, direction: 'reverse' })).toBe(true);
  });
});
