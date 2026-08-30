/**
 * Reading `data/bodies.json` into the shape the simulation wants.
 *
 * The file on disk is written to be audited by a person: degrees, kilometres,
 * two element conventions, a citation on every orbit. The simulation wants one
 * convention, in SI and radians. That conversion happens exactly once, here, and
 * everything downstream sees {@link Body}.
 *
 * The two orbit forms are both normalised to Standish's, which is the more
 * general of the two:
 *
 * - **standish** — mean elements with per-century rates, as published for the
 *   planets. Used directly.
 * - **osculating** — the instantaneous ellipse at J2000, as JPL Horizons reports
 *   it, used for the moons and dwarf planets where no fitted mean-element table
 *   exists. Converted by `ϖ = Ω + ω`, `L = ϖ + M`, and a mean-longitude rate
 *   derived from the orbital period. Every other rate is zero, which is the
 *   honest statement that this is a snapshot: it says where the moon is and how
 *   fast it goes round, and does not pretend to model the precession of its
 *   node.
 *
 * @module
 */

import type { Body, BodyCatalog, RingGeometry } from '@domain/body';
import type { OrbitalElements } from '@domain/orbits/elements';
import { DAYS_PER_JULIAN_CENTURY } from '@domain/time/julian';
import type {
  RawBody,
  RawCatalog,
  RawOsculatingOrbit,
  RawStandishOrbit,
} from '@features/space/catalog-schema';
import {
  METERS_PER_AU,
  type AstronomicalUnits,
  type Radians,
  days,
  degreesToRadians,
  degrees,
  gravitationalParameter,
  meters,
  radians,
} from '@shared/units';

/**
 * Converts an angle in degrees to radians.
 *
 * @param value - The angle in degrees.
 * @returns The same angle in radians.
 */
function toRadians(value: number): Radians {
  return degreesToRadians(degrees(value));
}

/**
 * Converts a `standish` orbit block.
 *
 * @param orbit - The raw block.
 * @returns Elements in AU and radians, with per-century rates.
 */
function fromStandish(orbit: RawStandishOrbit): OrbitalElements {
  return {
    semiMajorAxis: orbit.semiMajorAxisAu as AstronomicalUnits,
    eccentricity: orbit.eccentricity,
    inclination: toRadians(orbit.inclinationDeg),
    meanLongitude: toRadians(orbit.meanLongitudeDeg),
    longitudeOfPerihelion: toRadians(orbit.longitudeOfPerihelionDeg),
    longitudeOfAscendingNode: toRadians(orbit.longitudeOfAscendingNodeDeg),
    semiMajorAxisRate: orbit.semiMajorAxisRateAuPerCentury as AstronomicalUnits,
    eccentricityRate: orbit.eccentricityRatePerCentury,
    inclinationRate: toRadians(orbit.inclinationRateDegPerCentury),
    meanLongitudeRate: toRadians(orbit.meanLongitudeRateDegPerCentury),
    longitudeOfPerihelionRate: toRadians(orbit.longitudeOfPerihelionRateDegPerCentury),
    longitudeOfAscendingNodeRate: toRadians(orbit.longitudeOfAscendingNodeRateDegPerCentury),
  };
}

/**
 * Converts an `osculating` orbit block.
 *
 * @param orbit - The raw block.
 * @returns Elements in AU and radians, with only the mean longitude advancing.
 */
function fromOsculating(orbit: RawOsculatingOrbit): OrbitalElements {
  const longitudeOfPerihelionDeg = orbit.longitudeOfAscendingNodeDeg + orbit.argumentOfPeriapsisDeg;
  const meanLongitudeDeg = longitudeOfPerihelionDeg + orbit.meanAnomalyDeg;
  const degreesPerCentury = (360 / orbit.orbitalPeriodDays) * DAYS_PER_JULIAN_CENTURY;

  return {
    semiMajorAxis: ((orbit.semiMajorAxisKm * 1000) / METERS_PER_AU) as AstronomicalUnits,
    eccentricity: orbit.eccentricity,
    inclination: toRadians(orbit.inclinationDeg),
    meanLongitude: toRadians(meanLongitudeDeg),
    longitudeOfPerihelion: toRadians(longitudeOfPerihelionDeg),
    longitudeOfAscendingNode: toRadians(orbit.longitudeOfAscendingNodeDeg),
    semiMajorAxisRate: 0 as AstronomicalUnits,
    eccentricityRate: 0,
    inclinationRate: radians(0),
    meanLongitudeRate: toRadians(degreesPerCentury),
    longitudeOfPerihelionRate: radians(0),
    longitudeOfAscendingNodeRate: radians(0),
  };
}

/**
 * Converts one raw entry into a {@link Body}.
 *
 * @param raw - The entry as it appears in the catalogue file.
 * @returns The body, in SI units and radians.
 */
function toBody(raw: RawBody): Body {
  const rings: RingGeometry | undefined =
    raw.rings === undefined
      ? undefined
      : {
          innerRadius: meters(raw.rings.innerRadiusKm * 1000),
          outerRadius: meters(raw.rings.outerRadiusKm * 1000),
        };

  let orbit: OrbitalElements | undefined;
  if (raw.orbit !== null) {
    orbit = raw.orbit.form === 'standish' ? fromStandish(raw.orbit) : fromOsculating(raw.orbit);
  }

  return {
    id: raw.id,
    name: raw.name,
    kind: raw.kind,
    parentId: raw.parent ?? undefined,
    equatorialRadius: meters(raw.equatorialRadiusKm * 1000),
    polarRadius: meters(raw.polarRadiusKm * 1000),
    gravitationalParameter: gravitationalParameter(raw.gravitationalParameterKm3PerS2),
    rotation: {
      poleRightAscension: toRadians(raw.poleRightAscensionDeg),
      poleDeclination: toRadians(raw.poleDeclinationDeg),
      primeMeridian: toRadians(raw.primeMeridianDeg),
      primeMeridianRate: toRadians(raw.primeMeridianRateDegPerDay),
      rotationPeriod: days(raw.rotationPeriodDays),
    },
    albedo: raw.albedo,
    rings,
    orbit,
  };
}

/**
 * Builds an indexed catalogue from raw entries.
 *
 * @param raw - The parsed catalogue file.
 * @returns The catalogue, indexed for lookup.
 * @throws {Error} When the file names no root body, or names more than one.
 */
export function buildCatalog(raw: RawCatalog): BodyCatalog {
  const all = raw.bodies.map((entry) => toBody(entry));
  const index = new Map(all.map((body) => [body.id, body]));

  const children = new Map<string, Body[]>();
  for (const body of all) {
    if (body.parentId === undefined) {
      continue;
    }

    const siblings = children.get(body.parentId) ?? [];
    siblings.push(body);
    children.set(body.parentId, siblings);
  }

  const roots = all.filter((body) => body.parentId === undefined);
  const root = roots[0];
  if (root === undefined || roots.length > 1) {
    // A programmer error in the catalogue, not something a running program can
    // recover from, so it throws rather than returning a Result.
    throw new Error(
      `The catalogue must name exactly one root body; it names ${String(roots.length)}.`,
    );
  }

  return {
    all,
    root,
    byId: (id: string): Body | undefined => index.get(id),
    childrenOf: (id: string): readonly Body[] => children.get(id) ?? [],
    ancestorsOf(id: string): readonly Body[] {
      const chain: Body[] = [];
      let current = index.get(id)?.parentId;
      while (current !== undefined) {
        const parent = index.get(current);
        if (parent === undefined) {
          break;
        }
        chain.push(parent);
        current = parent.parentId;
      }
      return chain;
    },
  };
}
