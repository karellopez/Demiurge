import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { createRng, createRngFromState, forkRng, hashSeedText, type Rng } from '@shared/rng';

/**
 * Draws a fixed-length sample from a generator.
 *
 * @param rng - The generator to draw from.
 * @param count - How many draws to take.
 * @returns The drawn values, in order.
 */
function sample(rng: Rng, count: number): number[] {
  const values: number[] = [];
  for (let index = 0; index < count; index += 1) {
    values.push(rng.nextFloat());
  }
  return values;
}

describe('hashSeedText', () => {
  it('produces four 32-bit words', () => {
    const state = hashSeedText('kepler-22');
    expect(state).toHaveLength(4);
    for (const word of state) {
      expect(Number.isSafeInteger(word)).toBe(true);
      expect(word).toBeGreaterThanOrEqual(0);
      expect(word).toBeLessThanOrEqual(0xff_ff_ff_ff);
    }
  });

  it('separates seeds that differ by a single character', () => {
    expect(hashSeedText('seed-a')).not.toStrictEqual(hashSeedText('seed-b'));
  });

  it('is stable for the empty seed', () => {
    expect(hashSeedText('')).toStrictEqual(hashSeedText(''));
  });
});

describe('determinism', () => {
  it('replays an identical sequence for the same seed', () => {
    expect(sample(createRng('demiurge'), 64)).toStrictEqual(sample(createRng('demiurge'), 64));
  });

  it('produces a different sequence for a different seed', () => {
    expect(sample(createRng('demiurge'), 32)).not.toStrictEqual(sample(createRng('demiurgf'), 32));
  });

  it('replays an identical sequence from explicit state', () => {
    const state = hashSeedText('io');
    expect(sample(createRngFromState(state), 16)).toStrictEqual(
      sample(createRngFromState(state), 16),
    );
  });

  it('pins a known sequence so an accidental algorithm change is caught', () => {
    // Regenerating these numbers is a breaking change: every existing saved
    // world would generate differently. Changing them needs an ADR.
    const drawn = sample(createRng('demiurge'), 4).map((value) => value.toFixed(12));
    expect(drawn).toMatchInlineSnapshot(`
      [
        "0.761450564256",
        "0.548785519786",
        "0.755429184763",
        "0.770443226211",
      ]
    `);
  });
});

describe('forkRng', () => {
  it('gives differently-labelled streams different sequences', () => {
    expect(sample(forkRng('demiurge', 'mars/patch/3/17'), 16)).not.toStrictEqual(
      sample(forkRng('demiurge', 'mars/patch/3/18'), 16),
    );
  });

  it('does not depend on how far the parent stream has advanced', () => {
    const parent = createRng('demiurge');
    const before = sample(forkRng('demiurge', 'flora'), 8);
    sample(parent, 500);
    const after = sample(forkRng('demiurge', 'flora'), 8);
    expect(after).toStrictEqual(before);
  });
});

describe('draw ranges', () => {
  it('keeps floats inside the unit interval', () => {
    fc.assert(
      fc.property(fc.string(), (seed) => {
        const rng = createRng(seed);
        for (let index = 0; index < 200; index += 1) {
          const value = rng.nextFloat();
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThan(1);
        }
      }),
      { numRuns: 25 },
    );
  });

  it('keeps unsigned integers inside 32 bits', () => {
    const rng = createRng('bounds');
    for (let index = 0; index < 500; index += 1) {
      const value = rng.nextUint32();
      expect(Number.isSafeInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(0xff_ff_ff_ff);
    }
  });

  it('keeps nextRange inside its half-open bounds', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.double({ min: -1e6, max: 1e6, noNaN: true }),
        fc.double({ min: 0.001, max: 1e6, noNaN: true }),
        (seed, min, span) => {
          const value = createRng(seed).nextRange(min, min + span);
          expect(value).toBeGreaterThanOrEqual(min);
          expect(value).toBeLessThan(min + span);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('keeps nextInt inside its half-open bounds', () => {
    const rng = createRng('ints');
    for (let index = 0; index < 400; index += 1) {
      const value = rng.nextInt(3, 9);
      expect(Number.isSafeInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThan(9);
    }
  });

  it('reaches both ends of a small integer range', () => {
    const rng = createRng('coverage');
    const seen = new Set<number>();
    for (let index = 0; index < 400; index += 1) {
      seen.add(rng.nextInt(0, 4));
    }
    expect([...seen].toSorted((a, b) => a - b)).toStrictEqual([0, 1, 2, 3]);
  });
});
