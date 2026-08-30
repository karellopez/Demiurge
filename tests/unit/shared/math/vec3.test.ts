import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  add,
  addScaled,
  copy,
  createVec3,
  cross,
  distance,
  dot,
  isApproximately,
  length,
  lengthSquared,
  lerp,
  normalize,
  scale,
  set,
  subtract,
  type Vec3,
} from '@shared/math/vec3';

/**
 * Asserts a vector's components.
 *
 * @param actual - The vector under test.
 * @param x - Expected x.
 * @param y - Expected y.
 * @param z - Expected z.
 */
function expectVec3(actual: Vec3, x: number, y: number, z: number): void {
  expect([actual.x, actual.y, actual.z]).toStrictEqual([x, y, z]);
}

describe('construction', () => {
  it('defaults to the origin', () => {
    expectVec3(createVec3(), 0, 0, 0);
  });

  it('takes explicit components', () => {
    expectVec3(createVec3(1, 2, 3), 1, 2, 3);
  });

  it('sets components in place', () => {
    const target = createVec3();
    expect(set(target, 4, 5, 6)).toBe(target);
    expectVec3(target, 4, 5, 6);
  });

  it('copies without aliasing', () => {
    const source = createVec3(1, 2, 3);
    const target = copy(createVec3(), source);
    set(source, 9, 9, 9);
    expectVec3(target, 1, 2, 3);
  });
});

describe('arithmetic', () => {
  it('adds', () => {
    expectVec3(add(createVec3(), createVec3(1, 2, 3), createVec3(10, 20, 30)), 11, 22, 33);
  });

  it('subtracts', () => {
    expectVec3(subtract(createVec3(), createVec3(10, 20, 30), createVec3(1, 2, 3)), 9, 18, 27);
  });

  it('scales', () => {
    expectVec3(scale(createVec3(), createVec3(1, -2, 3), 2), 2, -4, 6);
  });

  it('adds a scaled vector without a scratch vector', () => {
    const result = addScaled(createVec3(), createVec3(1, 1, 1), createVec3(2, 4, 6), 0.5);
    expectVec3(result, 2, 3, 4);
  });

  it('interpolates', () => {
    expectVec3(lerp(createVec3(), createVec3(0, 0, 0), createVec3(10, 20, 30), 0.25), 2.5, 5, 7.5);
  });
});

describe('writing into an operand', () => {
  it('allows the output to alias the left operand', () => {
    const target = createVec3(1, 2, 3);
    add(target, target, createVec3(1, 1, 1));
    expectVec3(target, 2, 3, 4);
  });

  it('allows the output to alias the right operand', () => {
    const target = createVec3(1, 1, 1);
    subtract(target, createVec3(10, 10, 10), target);
    expectVec3(target, 9, 9, 9);
  });

  it('computes a cross product correctly even when the output aliases an input', () => {
    // The naive implementation overwrites x before y and z are read, so this is
    // the case that catches it.
    const a = createVec3(1, 0, 0);
    cross(a, a, createVec3(0, 1, 0));
    expectVec3(a, 0, 0, 1);
  });
});

describe('products', () => {
  it('computes a dot product', () => {
    expect(dot(createVec3(1, 2, 3), createVec3(4, -5, 6))).toBe(12);
  });

  it('reports zero for perpendicular vectors', () => {
    expect(dot(createVec3(1, 0, 0), createVec3(0, 1, 0))).toBe(0);
  });

  it('computes a right-handed cross product', () => {
    expectVec3(cross(createVec3(), createVec3(1, 0, 0), createVec3(0, 1, 0)), 0, 0, 1);
  });

  it('produces a vector perpendicular to both inputs', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1e6, max: 1e6, noNaN: true }),
        fc.double({ min: -1e6, max: 1e6, noNaN: true }),
        fc.double({ min: -1e6, max: 1e6, noNaN: true }),
        (x, y, z) => {
          const a = createVec3(x, y, z);
          const b = createVec3(z, x, y);
          const perpendicular = cross(createVec3(), a, b);
          const magnitude = Math.max(1, length(a) * length(b));
          expect(Math.abs(dot(perpendicular, a)) / magnitude).toBeLessThan(1e-6);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('magnitude', () => {
  it('measures a 3-4-5 triangle', () => {
    expect(length(createVec3(3, 4, 0))).toBe(5);
  });

  it('measures the square of a length without a square root', () => {
    expect(lengthSquared(createVec3(3, 4, 0))).toBe(25);
  });

  it('measures distance between two points', () => {
    expect(distance(createVec3(1, 2, 3), createVec3(4, 6, 3))).toBe(5);
  });

  it('does not overflow at solar-system magnitudes', () => {
    // Squaring 4.5e12 is fine in f64; this pins the behaviour so a later
    // change to the naive form is caught rather than discovered at Neptune.
    expect(length(createVec3(4.5e12, 0, 0))).toBe(4.5e12);
    expect(Number.isFinite(length(createVec3(1e200, 1e200, 1e200)))).toBe(true);
  });
});

describe('normalisation', () => {
  it('produces a unit vector', () => {
    expect(length(normalize(createVec3(), createVec3(0, 5, 0)))).toBeCloseTo(1, 12);
  });

  it('preserves direction', () => {
    expectVec3(normalize(createVec3(), createVec3(0, 5, 0)), 0, 1, 0);
  });

  it('leaves a zero vector as zero rather than producing NaN', () => {
    // A NaN here would propagate into a camera basis and only become visible
    // several frames later as a black screen.
    expectVec3(normalize(createVec3(), createVec3(0, 0, 0)), 0, 0, 0);
  });

  it('produces a unit vector for any non-zero input', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1e12, max: 1e12, noNaN: true }),
        fc.double({ min: -1e12, max: 1e12, noNaN: true }),
        fc.double({ min: -1e12, max: 1e12, noNaN: true }),
        (x, y, z) => {
          fc.pre(Math.hypot(x, y, z) > 1e-6);
          expect(length(normalize(createVec3(), createVec3(x, y, z)))).toBeCloseTo(1, 9);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('approximate equality', () => {
  it('accepts a difference inside the tolerance', () => {
    expect(isApproximately(createVec3(1, 1, 1), createVec3(1.0005, 1, 1), 0.001)).toBe(true);
  });

  it('rejects a difference outside the tolerance', () => {
    expect(isApproximately(createVec3(1, 1, 1), createVec3(1.002, 1, 1), 0.001)).toBe(false);
  });

  it('checks every component, not just the first', () => {
    expect(isApproximately(createVec3(1, 1, 1), createVec3(1, 1, 5), 0.001)).toBe(false);
    expect(isApproximately(createVec3(1, 1, 1), createVec3(1, 5, 1), 0.001)).toBe(false);
  });
});

describe('exactness the mutation suite pins down', () => {
  it('squares each component rather than adding them', () => {
    // Distinguishes x*x + y*y + z*z from x+y+z and from x*x*y*y*z*z.
    expect(lengthSquared(createVec3(2, 3, 6))).toBe(49);
    expect(lengthSquared(createVec3(1, 1, 1))).toBe(3);
    expect(lengthSquared(createVec3(0, 0, 5))).toBe(25);
  });

  it('interpolates each axis independently and exactly', () => {
    const result = lerp(createVec3(), createVec3(2, -4, 10), createVec3(6, 4, -10), 0.25);
    expectVec3(result, 3, -2, 5);
  });

  it('returns the endpoints exactly at t = 0 and t = 1', () => {
    expectVec3(lerp(createVec3(), createVec3(1, 2, 3), createVec3(9, 8, 7), 0), 1, 2, 3);
    expectVec3(lerp(createVec3(), createVec3(1, 2, 3), createVec3(9, 8, 7), 1), 9, 8, 7);
  });

  it('extrapolates past the endpoints, since t is documented as unclamped', () => {
    expectVec3(lerp(createVec3(), createVec3(0, 0, 0), createVec3(10, 10, 10), 2), 20, 20, 20);
    expectVec3(lerp(createVec3(), createVec3(0, 0, 0), createVec3(10, 10, 10), -1), -10, -10, -10);
  });

  it('treats a difference exactly equal to the tolerance as equal', () => {
    // Powers of two, so the difference is exactly representable and the
    // comparison really does land on the boundary. Decimal values like 1.001
    // do not: `1.001 - 1` is 0.0010000000000000009, which is already over.
    expect(isApproximately(createVec3(0, 0, 0), createVec3(0.5, 0, 0), 0.5)).toBe(true);
    expect(isApproximately(createVec3(0, 0, 0), createVec3(0, 0.5, 0), 0.5)).toBe(true);
    expect(isApproximately(createVec3(0, 0, 0), createVec3(0, 0, 0.5), 0.5)).toBe(true);
  });

  it('rejects a difference just past the tolerance on any axis', () => {
    expect(isApproximately(createVec3(0, 0, 0), createVec3(0.75, 0, 0), 0.5)).toBe(false);
    expect(isApproximately(createVec3(0, 0, 0), createVec3(0, 0.75, 0), 0.5)).toBe(false);
    expect(isApproximately(createVec3(0, 0, 0), createVec3(0, 0, 0.75), 0.5)).toBe(false);
  });
});

describe('the cross product component by component', () => {
  it('subtracts rather than adds in every component', () => {
    // Distinct values in every slot, so a sign or operator slip in any one of
    // the three components changes the result.
    const result = cross(createVec3(), createVec3(2, 3, 5), createVec3(7, 11, 13));
    expectVec3(result, 3 * 13 - 5 * 11, 5 * 7 - 2 * 13, 2 * 11 - 3 * 7);
  });

  it('anticommutes', () => {
    const first = createVec3(2, 3, 5);
    const second = createVec3(7, 11, 13);
    const forward = cross(createVec3(), first, second);
    const backward = cross(createVec3(), second, first);
    expectVec3(backward, -forward.x, -forward.y, -forward.z);
  });
});
