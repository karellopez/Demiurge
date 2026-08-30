/**
 * Turning the facts into the words a person reads.
 *
 * Separate from computing them, because the two change for different reasons: a
 * number changes when the physics does, and its wording changes when someone
 * cannot read it. Everything here is pure — no DOM, no locale detection beyond
 * a fixed grouping locale — so the wording and the units can be tested without
 * a document, and so the units are the same wherever they are shown.
 *
 * The unit choices are the ones a person actually wants: astronomical units
 * past a threshold and kilometres below it, years or days for a period
 * depending on which reads better, and an em dash wherever a quantity does not
 * exist rather than a zero that looks like a measurement.
 *
 * @module
 */

import { METERS_PER_AU, SECONDS_PER_DAY } from '@shared/units';

/** Beyond this many metres a distance reads better in astronomical units. */
const AU_DISPLAY_THRESHOLD = 0.01 * METERS_PER_AU;

/** Beyond this many days a period reads better in years. */
const YEAR_DISPLAY_THRESHOLD = 900;

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

/**
 * Formats local solar time as a clock reads it.
 *
 * @param hours - Local solar time, in hours, or `undefined` where it has no
 *   meaning.
 * @returns `HH:MM`, or an em dash.
 */
export function formatLocalTime(hours: number | undefined): string {
  if (hours === undefined || !Number.isFinite(hours)) {
    return '—';
  }
  const wrapped = ((hours % 24) + 24) % 24;
  const wholeHours = Math.floor(wrapped);
  const minutes = Math.floor((wrapped - wholeHours) * 60);
  return `${String(wholeHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
