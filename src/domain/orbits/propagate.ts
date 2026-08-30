/**
 * Turning orbital elements into a position.
 *
 * The chain, which is worth stating once because every step has a convention
 * that can be got wrong silently:
 *
 * 1. Advance each element by its per-century rate to the requested moment.
 * 2. Argument of perihelion `ω = ϖ − Ω`, and mean anomaly `M = L − ϖ`.
 * 3. Solve Kepler's equation for the eccentric anomaly `E`.
 * 4. Place the body in its own orbital plane, with perihelion along +x.
 * 5. Rotate that plane into the J2000 ecliptic frame: by `ω` about z, then by
 *    the inclination about x, then by `Ω` about z.
 *
 * The result is heliocentric, referred to the mean ecliptic and equinox of
 * J2000 — the same frame JPL Horizons reports with `REF_PLANE='ECLIPTIC'`,
 * which is what makes the fixture comparison meaningful rather than
 * approximate.
 *
 * Everything is zero-allocation: positions are written into a caller-supplied
 * vector, because this runs once per body per frame and again for every sample
 * along every orbit line.
 *
 * @module
 */

import type { EvaluatedElements, OrbitalElements } from '@domain/orbits/elements';
import { radiusFromEccentric, solveKepler, trueAnomalyFromEccentric } from '@domain/orbits/kepler';
import { type Vec3, set } from '@shared/math/vec3';
import { METERS_PER_AU, type Meters, type Radians, meters, radians } from '@shared/units';

/**
 * Advances the elements to a given moment.
 *
 * @param elements - The elements at J2000, with their per-century rates.
 * @param centuriesSinceJ2000 - Julian centuries since J2000.0. Negative before it.
 * @returns The elements evaluated at that moment.
 */
export function evaluateElements(
  elements: OrbitalElements,
  centuriesSinceJ2000: number,
): EvaluatedElements {
  const t = centuriesSinceJ2000;
  return {
    semiMajorAxis: (elements.semiMajorAxis +
      elements.semiMajorAxisRate * t) as EvaluatedElements['semiMajorAxis'],
    eccentricity: elements.eccentricity + elements.eccentricityRate * t,
    inclination: radians(elements.inclination + elements.inclinationRate * t),
    meanLongitude: radians(elements.meanLongitude + elements.meanLongitudeRate * t),
    longitudeOfPerihelion: radians(
      elements.longitudeOfPerihelion + elements.longitudeOfPerihelionRate * t,
    ),
    longitudeOfAscendingNode: radians(
      elements.longitudeOfAscendingNode + elements.longitudeOfAscendingNodeRate * t,
    ),
  };
}

/**
 * Places a body in the ecliptic frame from its evaluated elements.
 *
 * @param out - The vector to write into, in metres.
 * @param elements - Elements evaluated at the moment of interest.
 * @returns `out`, holding the position relative to the orbit's focus.
 */
export function positionFromElements(out: Vec3, elements: EvaluatedElements): Vec3 {
  const argumentOfPerihelion = radians(
    elements.longitudeOfPerihelion - elements.longitudeOfAscendingNode,
  );
  const meanAnomaly = radians(elements.meanLongitude - elements.longitudeOfPerihelion);

  const { eccentricAnomaly } = solveKepler(meanAnomaly, elements.eccentricity);
  const trueAnomaly = trueAnomalyFromEccentric(eccentricAnomaly, elements.eccentricity);
  const radiusAu = radiusFromEccentric(
    elements.semiMajorAxis,
    elements.eccentricity,
    eccentricAnomaly,
  );

  return placeInEcliptic(out, {
    radius: meters(radiusAu * METERS_PER_AU),
    trueAnomaly,
    argumentOfPerihelion,
    elements,
  });
}

/** Where a body is on its own ellipse, and how that ellipse is oriented. */
interface OrbitalPlacement {
  /** Distance from the focus. */
  readonly radius: Meters;
  /** Angle from perihelion, in the orbital plane. */
  readonly trueAnomaly: Radians;
  /** Angle from the ascending node to perihelion. */
  readonly argumentOfPerihelion: Radians;
  /** Supplies the inclination and the node longitude. */
  readonly elements: EvaluatedElements;
}

/**
 * Rotates a point from the orbital plane into the J2000 ecliptic frame.
 *
 * @param out - The vector to write into.
 * @param placement - Where the body is, and how its orbit is oriented.
 * @returns `out`, in the ecliptic frame.
 */
function placeInEcliptic(out: Vec3, placement: OrbitalPlacement): Vec3 {
  const { radius, trueAnomaly, argumentOfPerihelion, elements } = placement;

  // Position in the orbital plane, perihelion along +x.
  const xOrbital = radius * Math.cos(trueAnomaly);
  const yOrbital = radius * Math.sin(trueAnomaly);

  const cosArgument = Math.cos(argumentOfPerihelion);
  const sinArgument = Math.sin(argumentOfPerihelion);
  const cosNode = Math.cos(elements.longitudeOfAscendingNode);
  const sinNode = Math.sin(elements.longitudeOfAscendingNode);
  const cosInclination = Math.cos(elements.inclination);
  const sinInclination = Math.sin(elements.inclination);

  // Rotate by ω about z, then by I about x, then by Ω about z, expanded so the
  // whole transform is nine multiplies with no temporary matrix.
  const x =
    (cosArgument * cosNode - sinArgument * sinNode * cosInclination) * xOrbital +
    (-sinArgument * cosNode - cosArgument * sinNode * cosInclination) * yOrbital;
  const y =
    (cosArgument * sinNode + sinArgument * cosNode * cosInclination) * xOrbital +
    (-sinArgument * sinNode + cosArgument * cosNode * cosInclination) * yOrbital;
  const z = sinArgument * sinInclination * xOrbital + cosArgument * sinInclination * yOrbital;

  return set(out, x, y, z);
}

/**
 * Propagates an orbit to a moment and writes the position.
 *
 * @param out - The vector to write into, in metres relative to the orbit's focus.
 * @param elements - The elements at J2000, with rates.
 * @param centuriesSinceJ2000 - Julian centuries since J2000.0.
 * @returns `out`.
 */
export function propagateOrbit(
  out: Vec3,
  elements: OrbitalElements,
  centuriesSinceJ2000: number,
): Vec3 {
  return positionFromElements(out, evaluateElements(elements, centuriesSinceJ2000));
}

/**
 * Computes the heliocentric ecliptic longitude of a position.
 *
 * This is the quantity the accuracy claim is stated in, because it is the one
 * that matters for whether a planet appears in the right place: a small radial
 * error is invisible, an angular error is not.
 *
 * @param position - A position in the ecliptic frame.
 * @returns The longitude, in [0, 2π).
 */
export function eclipticLongitude(position: Vec3): Radians {
  const angle = Math.atan2(position.y, position.x);
  return radians(angle < 0 ? angle + Math.PI * 2 : angle);
}

/**
 * Computes the smallest angle between two longitudes.
 *
 * Wrapping matters: 359.9° and 0.1° are two tenths of a degree apart, not
 * 359.8°, and a comparison that got that wrong would pass or fail almost at
 * random near the equinox.
 *
 * @param first - One longitude.
 * @param second - The other.
 * @returns The separation, in [0, π].
 */
export function angularSeparation(first: Radians, second: Radians): Radians {
  const twoPi = Math.PI * 2;
  const difference = Math.abs(first - second) % twoPi;
  // Stryker disable next-line all: `>` and `>=` agree everywhere. They differ
  // only at exactly half a turn, where `2π − π` is `π`, so both arms return the
  // same separation.
  return radians(difference > Math.PI ? twoPi - difference : difference);
}

/**
 * Writes the normal of an orbital plane: the direction of angular momentum.
 *
 * This, not ecliptic north, is what a body's axial tilt is measured against.
 * The two differ by the orbit's inclination, which is under two degrees for
 * every planet and therefore just large enough to make a tilt look right while
 * being a degree wrong.
 *
 * @param out - The vector to write into.
 * @param elements - The orbit, evaluated at the moment of interest.
 * @returns `out`, a unit vector in the ecliptic frame.
 */
export function orbitNormal(out: Vec3, elements: EvaluatedElements): Vec3 {
  const sinInclination = Math.sin(elements.inclination);
  return set(
    out,
    sinInclination * Math.sin(elements.longitudeOfAscendingNode),
    -sinInclination * Math.cos(elements.longitudeOfAscendingNode),
    Math.cos(elements.inclination),
  );
}
