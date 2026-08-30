/**
 * The facts a body's stats card shows.
 *
 * All derived, none stored: every number here comes from the catalogue and the
 * current simulation state, so there is no second copy to fall out of step. The
 * card is the honest answer to "what am I looking at?", and the units are the
 * ones a person wants — astronomical units past a threshold, kilometres below
 * it, days or years for a period depending on which reads better.
 *
 * @module
 */

import { mass, surfaceGravity, type Body } from '@domain/body';
import { DAYS_PER_JULIAN_CENTURY } from '@domain/time/julian';
import type { ReadonlyVec3 } from '@shared/math/vec3';
import { METERS_PER_AU, SECONDS_PER_DAY, type Days, type Meters } from '@shared/units';

/** Beyond this many metres a distance reads better in astronomical units. */
const AU_DISPLAY_THRESHOLD = 0.01 * METERS_PER_AU;

/** Beyond this many days a period reads better in years. */
const YEAR_DISPLAY_THRESHOLD = 900;

/** Everything the stats card shows about a body. */
export interface BodyFacts {
  /** Distance from the camera. */
  readonly distanceFromCamera: Meters;
  /** Distance from the system's star. Zero for the star itself. */
  readonly distanceFromStar: Meters;
  /** Equatorial radius. */
  readonly radius: Meters;
  /** Mass, in kilograms, derived from the catalogued GM. */
  readonly massKilograms: number;
  /** Acceleration at the equatorial surface, in m/s². */
  readonly surfaceGravityMetersPerSecondSquared: number;
  /** Sidereal rotation period. Negative when the body turns retrograde. */
  readonly rotationPeriod: Days;
  /** Orbital period about its parent, or `undefined` for the root body. */
  readonly orbitalPeriod: Days | undefined;
}

/**
 * Computes a body's orbital period from its mean motion.
 *
 * The mean longitude rate is radians per Julian century, so the period is one
 * turn divided by that rate. Reading it back out of the elements rather than
 * storing it is what keeps the card from disagreeing with the propagator.
 *
 * @param body - The body to measure.
 * @returns The period in days, or `undefined` when the body does not orbit.
 */
export function orbitalPeriodDays(body: Body): Days | undefined {
  const elements = body.orbit;
  if (elements === undefined || elements.meanLongitudeRate === 0) {
    return undefined;
  }
  const centuries = (Math.PI * 2) / Math.abs(elements.meanLongitudeRate);
  return (centuries * DAYS_PER_JULIAN_CENTURY) as Days;
}

/**
 * Gathers the facts for a body.
 *
 * @param body - The body to describe.
 * @param bodyPosition - Its current heliocentric position, in true metres.
 * @param starPosition - The star's current position.
 * @param cameraPosition - The camera's current position.
 * @returns The facts, ready for display.
 */
export function computeBodyFacts(
  body: Body,
  bodyPosition: ReadonlyVec3,
  starPosition: ReadonlyVec3,
  cameraPosition: ReadonlyVec3,
): BodyFacts {
  return {
    distanceFromCamera: distanceBetween(bodyPosition, cameraPosition),
    distanceFromStar: distanceBetween(bodyPosition, starPosition),
    radius: body.equatorialRadius,
    massKilograms: mass(body),
    surfaceGravityMetersPerSecondSquared: surfaceGravity(body),
    rotationPeriod: body.rotation.rotationPeriod,
    orbitalPeriod: orbitalPeriodDays(body),
  };
}

/**
 * Measures the distance between two points.
 *
 * @param first - One point.
 * @param second - The other.
 * @returns The distance, in metres.
 */
function distanceBetween(first: ReadonlyVec3, second: ReadonlyVec3): Meters {
  return Math.hypot(first.x - second.x, first.y - second.y, first.z - second.z) as Meters;
}

/**
 * Formats a distance the way a person would say it.
 *
 * Astronomical units for interplanetary distances, kilometres below that, and
 * metres when standing next to something. A single unit across fourteen orders
 * of magnitude is unreadable in either direction.
 *
 * @param distanceMeters - The distance to format.
 * @returns A short string with a unit.
 */
export function formatDistance(distanceMeters: number): string {
  if (!Number.isFinite(distanceMeters)) {
    return '—';
  }
  if (distanceMeters >= AU_DISPLAY_THRESHOLD) {
    return `${(distanceMeters / METERS_PER_AU).toFixed(3)} au`;
  }
  if (distanceMeters >= 1000) {
    return `${Math.round(distanceMeters / 1000).toLocaleString('en-GB')} km`;
  }
  return `${Math.round(distanceMeters).toLocaleString('en-GB')} m`;
}

/**
 * Formats a period the way a person would say it.
 *
 * @param periodDays - The period in days. May be negative for retrograde rotation.
 * @returns A short string with a unit, or an em dash when there is no period.
 */
export function formatPeriod(periodDays: number | undefined): string {
  if (periodDays === undefined || !Number.isFinite(periodDays)) {
    return '—';
  }

  const magnitude = Math.abs(periodDays);
  // Retrograde rotation is a fact about the body, not a rounding artefact, so it
  // is spelled out rather than left as a minus sign nobody will read.
  const suffix = periodDays < 0 ? ' retrograde' : '';

  if (magnitude >= YEAR_DISPLAY_THRESHOLD) {
    return `${(magnitude / 365.25).toFixed(1)} years${suffix}`;
  }
  if (magnitude >= 2) {
    return `${magnitude.toFixed(2)} days${suffix}`;
  }
  return `${(magnitude * (SECONDS_PER_DAY / 3600)).toFixed(2)} hours${suffix}`;
}

/**
 * Formats a surface gravity against Earth's, which is the only useful comparison.
 *
 * @param metersPerSecondSquared - The acceleration at the surface.
 * @returns A string giving both the absolute value and the ratio to Earth.
 */
export function formatSurfaceGravity(metersPerSecondSquared: number): string {
  if (!Number.isFinite(metersPerSecondSquared)) {
    return '—';
  }
  const earthGravity = 9.80665;
  return `${metersPerSecondSquared.toFixed(2)} m/s² · ${(metersPerSecondSquared / earthGravity).toFixed(2)}g`;
}

/**
 * Formats a radius.
 *
 * @param radiusMeters - The radius to format.
 * @returns A short string in kilometres.
 */
export function formatRadius(radiusMeters: number): string {
  if (!Number.isFinite(radiusMeters)) {
    return '—';
  }
  const kilometres = radiusMeters / 1000;
  return `${kilometres < 100 ? kilometres.toFixed(1) : Math.round(kilometres).toLocaleString('en-GB')} km`;
}

/** Unicode superscripts for the digits of an exponent. */
const SUPERSCRIPT_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';

/**
 * Formats a mass in scientific notation, the way a table of planets does.
 *
 * Masses in this system span thirty orders of magnitude — Phobos is 1.1e16 kg
 * and the Sun is 2.0e30 — so there is no fixed unit that works, and `2e+30` is
 * programmer notation rather than something a person reads.
 *
 * @param kilograms - The mass to format.
 * @returns A string such as `5.97 × 10²⁴ kg`.
 */
export function formatMass(kilograms: number): string {
  if (!Number.isFinite(kilograms) || kilograms <= 0) {
    return '—';
  }
  const exponent = Math.floor(Math.log10(kilograms));
  const mantissa = kilograms / 10 ** exponent;
  return `${mantissa.toFixed(2)} × 10${superscript(exponent)} kg`;
}

/**
 * Renders an exponent in superscript digits.
 *
 * @param exponent - The exponent, which may be negative.
 * @returns The exponent as superscript characters.
 */
function superscript(exponent: number): string {
  const sign = exponent < 0 ? '⁻' : '';
  return (
    sign +
    Math.abs(exponent)
      .toFixed(0)
      .replaceAll(/\d/gu, (digit) => SUPERSCRIPT_DIGITS[Number(digit)] ?? digit)
  );
}
