/**
 * The shape of `data/bodies.json` as it is written on disk.
 *
 * These types describe the *wire format*, not the simulation's model: degrees,
 * kilometres, `null` for absence, and two different orbital element conventions.
 * They exist so the conversion in `body-catalog.ts` has something typed to read
 * from, and so a change to the file's layout is a compile error rather than a
 * planet in the wrong place.
 *
 * The file itself is validated against `data/bodies.schema.json` by
 * `npm run validate:data`, which runs as part of `npm run verify`. These types
 * and that schema describe the same thing twice, in two languages, which is a
 * duplication worth having: the schema catches a malformed file at build time,
 * and the types catch a mismatched reader at compile time.
 *
 * @module
 */

import type { BodyKind } from '@domain/body';

/** Mean elements with per-century rates, as Standish's tables publish them. */
export interface RawStandishOrbit {
  readonly form: 'standish';
  readonly semiMajorAxisAu: number;
  readonly eccentricity: number;
  readonly inclinationDeg: number;
  readonly meanLongitudeDeg: number;
  readonly longitudeOfPerihelionDeg: number;
  readonly longitudeOfAscendingNodeDeg: number;
  readonly semiMajorAxisRateAuPerCentury: number;
  readonly eccentricityRatePerCentury: number;
  readonly inclinationRateDegPerCentury: number;
  readonly meanLongitudeRateDegPerCentury: number;
  readonly longitudeOfPerihelionRateDegPerCentury: number;
  readonly longitudeOfAscendingNodeRateDegPerCentury: number;
}

/** Osculating elements at J2000, as JPL Horizons reports them. */
export interface RawOsculatingOrbit {
  readonly form: 'osculating';
  readonly semiMajorAxisKm: number;
  readonly eccentricity: number;
  readonly inclinationDeg: number;
  readonly longitudeOfAscendingNodeDeg: number;
  readonly argumentOfPeriapsisDeg: number;
  readonly meanAnomalyDeg: number;
  readonly orbitalPeriodDays: number;
}

/** One catalogue entry, exactly as the file writes it. */
export interface RawBody {
  readonly id: string;
  readonly name: string;
  readonly kind: BodyKind;
  readonly parent: string | null;
  readonly equatorialRadiusKm: number;
  readonly polarRadiusKm: number;
  readonly gravitationalParameterKm3PerS2: number;
  readonly rotationPeriodDays: number;
  readonly poleRightAscensionDeg: number;
  readonly poleDeclinationDeg: number;
  readonly primeMeridianDeg: number;
  readonly primeMeridianRateDegPerDay: number;
  readonly albedo: number;
  readonly rings?: { readonly innerRadiusKm: number; readonly outerRadiusKm: number };
  readonly orbit: RawStandishOrbit | RawOsculatingOrbit | null;
}

/** The whole catalogue file. */
export interface RawCatalog {
  readonly epoch: string;
  readonly bodies: readonly RawBody[];
}
