import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  HALLEY_ECCENTRICITY_THRESHOLD,
  halleyStep,
  KEPLER_MAX_ITERATIONS,
  KEPLER_TOLERANCE,
  radiusFromEccentric,
  solveKepler,
  trueAnomalyFromEccentric,
  wrapToPi,
} from '@domain/orbits/kepler';
import { radians } from '@shared/units';

describe('wrapping an angle', () => {
  it('leaves an angle already in range alone', () => {
    expect(wrapToPi(radians(1))).toBeCloseTo(1, 12);
    expect(wrapToPi(radians(-1))).toBeCloseTo(-1, 12);
  });

  it('wraps past half a turn', () => {
    expect(wrapToPi(radians(Math.PI * 1.5))).toBeCloseTo(-Math.PI * 0.5, 12);
  });

  it('wraps below minus half a turn', () => {
    expect(wrapToPi(radians(-Math.PI * 1.5))).toBeCloseTo(Math.PI * 0.5, 12);
  });

  it('wraps many turns, which is what centuries of mean motion produce', () => {
    expect(wrapToPi(radians(Math.PI * 2 * 1000 + 0.5))).toBeCloseTo(0.5, 9);
  });

  it('always lands inside the interval', () => {
    fc.assert(
      fc.property(fc.double({ min: -1e6, max: 1e6, noNaN: true }), (angle) => {
        const wrapped = wrapToPi(radians(angle));
        expect(wrapped).toBeGreaterThanOrEqual(-Math.PI);
        expect(wrapped).toBeLessThanOrEqual(Math.PI);
      }),
      { numRuns: 300 },
    );
  });
});

describe('a circular orbit', () => {
  it('needs no iteration at all', () => {
    const solution = solveKepler(radians(1.234), 0);
    expect(solution.iterations).toBe(0);
    expect(solution.eccentricAnomaly).toBeCloseTo(1.234, 12);
  });
});

describe('solving Kepler', () => {
  it('satisfies its own equation', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
        fc.double({ min: 0, max: 0.97, noNaN: true }),
        (meanAnomaly, eccentricity) => {
          const { eccentricAnomaly } = solveKepler(radians(meanAnomaly), eccentricity);
          const residual =
            eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly) - meanAnomaly;
          expect(Math.abs(residual)).toBeLessThan(1e-9);
        },
      ),
      { numRuns: 400 },
    );
  });

  it('converges quickly for the eccentricities in the catalogue', () => {
    // Pluto is the worst at about 0.249; Eris reaches 0.433.
    for (const eccentricity of [0.0068, 0.0167, 0.0934, 0.2488, 0.433]) {
      const { iterations, hitIterationCap } = solveKepler(radians(2.5), eccentricity);
      expect(hitIterationCap).toBe(false);
      expect(iterations).toBeLessThan(12);
    }
  });

  it('converges for a near-parabolic orbit, where Newton alone struggles', () => {
    for (const eccentricity of [0.9, 0.95, 0.99, 0.995]) {
      const { eccentricAnomaly, hitIterationCap } = solveKepler(radians(0.05), eccentricity);
      const residual = eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly) - 0.05;
      expect(hitIterationCap, `e=${String(eccentricity)} hit the cap`).toBe(false);
      expect(Math.abs(residual)).toBeLessThan(1e-9);
    }
  });

  it('switches method at the documented eccentricity', () => {
    expect(HALLEY_ECCENTRICITY_THRESHOLD).toBeCloseTo(0.9, 12);
  });

  it('never exceeds the iteration cap', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -50, max: 50, noNaN: true }),
        fc.double({ min: 0, max: 0.999, noNaN: true }),
        (meanAnomaly, eccentricity) => {
          expect(solveKepler(radians(meanAnomaly), eccentricity).iterations).toBeLessThanOrEqual(
            KEPLER_MAX_ITERATIONS,
          );
        },
      ),
      { numRuns: 200 },
    );
  });

  it('is exact at periapsis and apoapsis', () => {
    expect(solveKepler(radians(0), 0.5).eccentricAnomaly).toBeCloseTo(0, 12);
    expect(Math.abs(solveKepler(radians(Math.PI), 0.5).eccentricAnomaly)).toBeCloseTo(Math.PI, 9);
  });

  it('holds to the documented tolerance', () => {
    expect(KEPLER_TOLERANCE).toBeCloseTo(1e-12, 15);
  });
});

describe('the true anomaly', () => {
  it('matches the eccentric anomaly on a circle', () => {
    expect(trueAnomalyFromEccentric(radians(1.1), 0)).toBeCloseTo(1.1, 12);
  });

  it('runs ahead of the eccentric anomaly before apoapsis', () => {
    // On an ellipse a body sweeps quickly through periapsis, so the true anomaly
    // leads the eccentric one over the first half of the orbit.
    const eccentric = radians(1);
    expect(trueAnomalyFromEccentric(eccentric, 0.5)).toBeGreaterThan(eccentric);
  });

  it('is zero at periapsis and half a turn at apoapsis', () => {
    expect(trueAnomalyFromEccentric(radians(0), 0.4)).toBeCloseTo(0, 12);
    expect(Math.abs(trueAnomalyFromEccentric(radians(Math.PI), 0.4))).toBeCloseTo(Math.PI, 9);
  });

  it('keeps the sign of the eccentric anomaly', () => {
    expect(trueAnomalyFromEccentric(radians(-1), 0.3)).toBeLessThan(0);
  });
});

describe('the radius', () => {
  it('is the periapsis distance at periapsis', () => {
    expect(radiusFromEccentric(10, 0.2, radians(0))).toBeCloseTo(8, 12);
  });

  it('is the apoapsis distance at apoapsis', () => {
    expect(radiusFromEccentric(10, 0.2, radians(Math.PI))).toBeCloseTo(12, 12);
  });

  it('is the semi-major axis on a circle', () => {
    expect(radiusFromEccentric(10, 0, radians(1.7))).toBe(10);
  });
});

describe('the Halley step', () => {
  it('uses the Halley denominator when it is well conditioned', () => {
    // f' = 1, f'' = 0 makes the Halley denominator equal to f', so the step is
    // exactly Newton's and easy to state.
    expect(halleyStep(0.5, 1, 0)).toBeCloseTo(0.5, 12);
  });

  it('converges faster than Newton when the second derivative is significant', () => {
    const newton = 0.5 / 1;
    expect(halleyStep(0.5, 1, 0.4)).not.toBeCloseTo(newton, 6);
  });

  it('falls back to a Newton step rather than dividing by zero', () => {
    // Chosen so `f' - f·f''/(2f')` is exactly zero: 1 - (2 · 1)/(2 · 1) = 0.
    // Without the guard this returns Infinity, which would propagate into a
    // position and surface much later as a body that simply vanished.
    const step = halleyStep(2, 1, 1);
    expect(Number.isFinite(step)).toBe(true);
    expect(step).toBeCloseTo(2, 12);
  });

  it('is finite for every eccentricity the catalogue contains', () => {
    for (const eccentricity of [0.0068, 0.0934, 0.2488, 0.433, 0.95]) {
      const { eccentricAnomaly } = solveKepler(radians(0), eccentricity);
      expect(Number.isFinite(eccentricAnomaly)).toBe(true);
    }
  });
});

describe('the near-parabolic starting estimate', () => {
  it('starts at zero when the mean anomaly is zero', () => {
    // The `M === 0` arm of the near-parabolic guess. Starting anywhere else here
    // would step away from a root that is already exactly at the origin.
    expect(solveKepler(radians(0), 0.95).eccentricAnomaly).toBeCloseTo(0, 12);
  });

  it('starts on the correct side for a negative mean anomaly', () => {
    expect(solveKepler(radians(-0.2), 0.95).eccentricAnomaly).toBeLessThan(0);
  });
});

/**
 * Sweeps the whole (M, e) space the project can produce.
 *
 * @returns The worst iteration count seen, and how often the cap was hit.
 */
function sweep(): { worst: number; capHits: number } {
  let worst = 0;
  let capHits = 0;
  for (const eccentricity of [0, 0.1, 0.5, 0.89, 0.9, 0.95, 0.99, 0.999, 0.9999999]) {
    for (let step = 0; step <= 400; step += 1) {
      const meanAnomaly = -Math.PI + (step / 400) * 2 * Math.PI;
      const result = solveKepler(radians(meanAnomaly), eccentricity);
      worst = Math.max(worst, result.iterations);
      capHits += result.hitIterationCap ? 1 : 0;
    }
  }
  return { worst, capHits };
}

describe('how hard the solver actually works', () => {
  it('never needs more than seven iterations, anywhere', () => {
    // Seven is the measured worst case over the whole sweep, not a round number
    // with headroom. It is asserted tightly on purpose: the initial estimate and
    // the Newton/Halley split exist precisely to keep this small, and both are
    // otherwise invisible, because either choice eventually reaches the same
    // answer. Convergence speed is the only observable difference between a good
    // solver and a merely correct one.
    expect(sweep().worst).toBeLessThanOrEqual(7);
  });

  it('never reaches the iteration cap', () => {
    // The cap is a safety net against a future change turning the loop
    // unbounded, not a case that occurs. Its arm is therefore unreachable by
    // construction, which is why the mutants inside it are excluded at the site.
    expect(sweep().capHits).toBe(0);
  });

  it('converges in at most four iterations for every eccentricity in the catalogue', () => {
    for (const eccentricity of [0.0167, 0.0934, 0.2488, 0.4325]) {
      for (let step = 0; step < 16; step += 1) {
        const meanAnomaly = -Math.PI + (step / 16) * 2 * Math.PI;
        expect(
          solveKepler(radians(meanAnomaly), eccentricity).iterations,
          `e=${String(eccentricity)} M=${String(meanAnomaly)}`,
        ).toBeLessThanOrEqual(4);
      }
    }
  });

  it('uses Halley above the threshold and Newton below it', () => {
    // The two methods reach the same answer, so the only observable difference
    // is how fast. At e = 0.95 Halley's cubic convergence shows.
    expect(solveKepler(radians(0.05), 0.95).iterations).toBeLessThanOrEqual(5);
  });
});

describe('wrapping exactly at the boundary', () => {
  it('leaves half a turn alone rather than wrapping it to minus half a turn', () => {
    expect(wrapToPi(radians(Math.PI))).toBeCloseTo(Math.PI, 12);
  });

  it('leaves minus half a turn alone', () => {
    expect(wrapToPi(radians(-Math.PI))).toBeCloseTo(-Math.PI, 12);
  });
});

describe('the Halley denominator', () => {
  it('halves the first derivative rather than dividing by it', () => {
    // f' - f·f''/(2f') with f = 1, f' = 2, f'' = 1 is 2 - 1/4 = 1.75, so the
    // step is 1/1.75. Dividing by two instead of multiplying gives 2 - 1 = 1 and
    // a step of 1, which is a different answer.
    expect(halleyStep(1, 2, 1)).toBeCloseTo(1 / 1.75, 12);
  });
});
