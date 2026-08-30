/**
 * Keplerian orbital elements, and how they drift.
 *
 * Six numbers fix an orbit and a position on it. They are stored here in the
 * form Standish's tables publish them, which is not quite the textbook form and
 * is worth naming precisely, because two of them are *longitudes* measured from
 * a fixed direction rather than *arguments* measured from the ascending node:
 *
 * - `semiMajorAxis` — half the long axis of the ellipse.
 * - `eccentricity` — 0 is a circle, approaching 1 is a very long ellipse.
 * - `inclination` — tilt of the orbital plane against the J2000 ecliptic.
 * - `meanLongitude` (L) — where the body would be if it moved uniformly,
 *   measured from the vernal equinox, *through* the ascending node.
 * - `longitudeOfPerihelion` (ϖ) — the same broken-path measure, to perihelion.
 *   Note ϖ = Ω + ω, so the argument of perihelion is ϖ − Ω.
 * - `longitudeOfAscendingNode` (Ω) — where the orbit crosses the ecliptic going
 *   north.
 *
 * Each element also carries a rate per Julian century. Orbits precess and drift;
 * over the 1800–2050 window these tables are fitted to, ignoring the rates would
 * put Mercury several degrees out of position by 2050.
 *
 * Angles are in radians here. The JSON source publishes degrees, because that is
 * how every citable table publishes them and a transcription is easier to check
 * against its source when the numbers still look like the source; the conversion
 * happens once, at load.
 *
 * @see Standish, *Keplerian Elements for Approximate Positions of the Major
 *   Planets*, JPL Solar System Dynamics.
 * @module
 */

import type { AstronomicalUnits, Radians } from '@shared/units';

/** The six elements at an epoch, plus their per-century rates. */
export interface OrbitalElements {
  /** Semi-major axis at J2000. */
  readonly semiMajorAxis: AstronomicalUnits;
  /** Eccentricity at J2000. Dimensionless, in [0, 1). */
  readonly eccentricity: number;
  /** Inclination to the J2000 ecliptic, at J2000. */
  readonly inclination: Radians;
  /** Mean longitude at J2000. */
  readonly meanLongitude: Radians;
  /** Longitude of perihelion at J2000. */
  readonly longitudeOfPerihelion: Radians;
  /** Longitude of the ascending node at J2000. */
  readonly longitudeOfAscendingNode: Radians;

  /** Change in semi-major axis per Julian century. */
  readonly semiMajorAxisRate: AstronomicalUnits;
  /** Change in eccentricity per Julian century. */
  readonly eccentricityRate: number;
  /** Change in inclination per Julian century. */
  readonly inclinationRate: Radians;
  /** Change in mean longitude per Julian century. This is the orbital motion. */
  readonly meanLongitudeRate: Radians;
  /** Change in longitude of perihelion per Julian century. */
  readonly longitudeOfPerihelionRate: Radians;
  /** Change in longitude of the ascending node per Julian century. */
  readonly longitudeOfAscendingNodeRate: Radians;
}

/**
 * The six elements evaluated at a particular moment.
 *
 * Distinct from {@link OrbitalElements} on purpose: that type is a fit with
 * rates attached, this one is a set of numbers describing an orbit *now*, and
 * confusing the two is how a rate ends up used as a value.
 */
export interface EvaluatedElements {
  readonly semiMajorAxis: AstronomicalUnits;
  readonly eccentricity: number;
  readonly inclination: Radians;
  readonly meanLongitude: Radians;
  readonly longitudeOfPerihelion: Radians;
  readonly longitudeOfAscendingNode: Radians;
}
