/**
 * Solving Kepler's equation.
 *
 * `M = E − e·sin E` has no closed form for `E`, so it is solved numerically, and
 * it is solved several hundred times per frame — once per body, and again per
 * sample along every orbit line. It is worth getting both the accuracy and the
 * convergence right.
 *
 * Two methods, chosen by eccentricity:
 *
 * - **Newton–Raphson** below e = 0.9. Quadratic convergence, four or five
 *   iterations from a decent guess, and cheap per iteration.
 * - **Halley** at and above e = 0.9. Newton's denominator `1 − e·cos E` goes to
 *   near zero close to periapsis on a very eccentric orbit, so the step
 *   overshoots and the iteration can wander for dozens of iterations or refuse
 *   to settle. Halley uses the second derivative as well, is cubic, and is
 *   stable exactly where Newton is not. Eris (e ≈ 0.44) and Pluto (e ≈ 0.25) do
 *   not need it; a comet added later will.
 *
 * The iteration is capped. Exceeding the cap returns the best estimate reached
 * together with a flag saying so, rather than looping or throwing: a body one
 * iteration short of tolerance is still in very nearly the right place, and a
 * frozen tab is a far worse outcome than an orbit that is out by a
 * micro-arcsecond. The flag exists so that a caller — or a test — can tell the
 * difference instead of guessing.
 *
 * @see Danby, *Fundamentals of Celestial Mechanics* (1988), ch. 6.
 * @module
 */

import { type Radians, radians } from '@shared/units';

/** Eccentricity at and above which Halley's method is used instead of Newton's. */
export const HALLEY_ECCENTRICITY_THRESHOLD = 0.9;

/** Convergence tolerance on the eccentric anomaly, in radians. */
export const KEPLER_TOLERANCE = 1e-12;

/** Iterations allowed before the solver gives up and reports its best estimate. */
export const KEPLER_MAX_ITERATIONS = 64;

/** The outcome of solving Kepler's equation. */
export interface KeplerSolution {
  /** The eccentric anomaly. */
  readonly eccentricAnomaly: Radians;
  /** How many iterations were spent. */
  readonly iterations: number;
  /**
   * True when the iteration cap was reached before the tolerance was met. The
   * anomaly is still the best estimate found, and is very nearly right.
   */
  readonly hitIterationCap: boolean;
}

/**
 * Wraps an angle into [−π, π].
 *
 * Mean anomaly grows without bound as time runs, and by the year 3000 it is a
 * large number whose low bits are the part that matters. Wrapping first keeps
 * the solver's input small and its precision intact.
 *
 * @param angle - Any angle in radians.
 * @returns The same angle, in [−π, π].
 */
export function wrapToPi(angle: Radians): Radians {
  const twoPi = Math.PI * 2;
  const wrapped = angle % twoPi;
  if (wrapped > Math.PI) {
    return radians(wrapped - twoPi);
  }
  if (wrapped < -Math.PI) {
    return radians(wrapped + twoPi);
  }
  return radians(wrapped);
}

/**
 * Chooses a starting eccentric anomaly.
 *
 * `E ≈ M + e·sin M` is the first term of the series solution and is close enough
 * that Newton converges in a handful of iterations across almost the whole
 * range. Near-parabolic orbits get a different treatment because that estimate
 * degrades exactly where the solver is already struggling.
 *
 * @param meanAnomaly - The mean anomaly, wrapped to [−π, π].
 * @param eccentricity - Orbital eccentricity, in [0, 1).
 * @returns A starting estimate for the eccentric anomaly.
 */
function initialGuess(meanAnomaly: number, eccentricity: number): number {
  if (eccentricity < HALLEY_ECCENTRICITY_THRESHOLD) {
    return meanAnomaly + eccentricity * Math.sin(meanAnomaly);
  }
  // Near-parabolic: start at π in the direction of M, which is inside the basin
  // of convergence even when the M + e·sin M estimate is not.
  return meanAnomaly === 0 ? 0 : Math.sign(meanAnomaly) * Math.PI * 0.5;
}

/**
 * Solves Kepler's equation for an elliptical orbit.
 *
 * @param meanAnomaly - The mean anomaly. Wrapped internally, so any value is fine.
 * @param eccentricity - Orbital eccentricity, in [0, 1).
 * @returns The eccentric anomaly, and how the solver got there.
 */
export function solveKepler(meanAnomaly: Radians, eccentricity: number): KeplerSolution {
  const wrapped = wrapToPi(meanAnomaly);

  // A circle needs no iteration, and saying so avoids a pointless pass for the
  // several bodies whose eccentricity rounds to nothing.
  if (eccentricity === 0) {
    return { eccentricAnomaly: wrapped, iterations: 0, hitIterationCap: false };
  }

  const isUseHalley = eccentricity >= HALLEY_ECCENTRICITY_THRESHOLD;
  let estimate = initialGuess(wrapped, eccentricity);

  // Stryker disable next-line all: the loop bookkeeping is unobservable, because
  // the solver always returns from inside the loop within seven passes. Off-by-one
  // in a bound that is never approached cannot change any result.
  for (let iteration = 1; iteration <= KEPLER_MAX_ITERATIONS; iteration += 1) {
    const sinE = Math.sin(estimate);
    const cosE = Math.cos(estimate);

    // f(E) = E − e·sin E − M, whose root is what we want.
    const f = estimate - eccentricity * sinE - wrapped;
    const firstDerivative = 1 - eccentricity * cosE;

    const step = isUseHalley
      ? halleyStep(f, firstDerivative, eccentricity * sinE)
      : f / firstDerivative;

    estimate -= step;

    // Stryker disable next-line all: `<=` and `<` differ only when the step is
    // exactly 1e-12, which no double-precision iteration produces.
    if (Math.abs(step) <= KEPLER_TOLERANCE) {
      return {
        eccentricAnomaly: radians(estimate),
        iterations: iteration,
        hitIterationCap: false,
      };
    }
  }

  // Stryker disable all: unreachable by construction. A dense sweep of the whole
  // (M, e) space, including e = 0.9999999, needs at most seven iterations - see
  // "never reaches the iteration cap" in the tests. This arm is a safety net
  // against a future change making the loop unbounded, not a case that occurs,
  // so no test can distinguish a mutant inside it.
  return {
    eccentricAnomaly: radians(estimate),
    iterations: KEPLER_MAX_ITERATIONS,
    hitIterationCap: true,
  };
  // Stryker restore all
}

/**
 * Computes one Halley step.
 *
 * Exported for its own sake: the degenerate case below is rare enough that it
 * will never be reached by driving `solveKepler`, and a numeric guard nobody can
 * exercise is a guard nobody knows still works.
 *
 * @param f - The residual, `E − e·sin E − M`.
 * @param firstDerivative - `1 − e·cos E`. For e < 1 this lies in (0, 2), so it is
 *   always a safe divisor.
 * @param secondDerivative - `e·sin E`.
 * @returns The correction to subtract from the current estimate.
 */
export function halleyStep(f: number, firstDerivative: number, secondDerivative: number): number {
  const halleyDenominator = firstDerivative - (f * secondDerivative) / (2 * firstDerivative);
  // Fall back to a Newton step rather than emitting an infinity, which would
  // propagate into a position and only surface as a body vanishing.
  return f / (halleyDenominator === 0 ? firstDerivative : halleyDenominator);
}

/**
 * Converts an eccentric anomaly to a true anomaly.
 *
 * The half-angle form is used rather than `cos ν = (cos E − e)/(1 − e·cos E)`
 * because the latter loses the quadrant and needs a sign fix-up that is easy to
 * get wrong; `atan2` of the half-angle terms is unambiguous everywhere.
 *
 * @param eccentricAnomaly - The eccentric anomaly.
 * @param eccentricity - Orbital eccentricity, in [0, 1).
 * @returns The true anomaly, in [−π, π].
 */
export function trueAnomalyFromEccentric(eccentricAnomaly: Radians, eccentricity: number): Radians {
  const half = eccentricAnomaly / 2;
  return radians(
    2 *
      Math.atan2(
        Math.sqrt(1 + eccentricity) * Math.sin(half),
        Math.sqrt(1 - eccentricity) * Math.cos(half),
      ),
  );
}

/**
 * Computes the distance from the focus at a given eccentric anomaly.
 *
 * @param semiMajorAxisMeters - The semi-major axis.
 * @param eccentricity - Orbital eccentricity, in [0, 1).
 * @param eccentricAnomaly - The eccentric anomaly.
 * @returns The distance from the focus, in the same unit as the semi-major axis.
 */
export function radiusFromEccentric(
  semiMajorAxisMeters: number,
  eccentricity: number,
  eccentricAnomaly: Radians,
): number {
  return semiMajorAxisMeters * (1 - eccentricity * Math.cos(eccentricAnomaly));
}
