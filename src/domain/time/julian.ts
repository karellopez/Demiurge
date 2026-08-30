/**
 * Time, expressed the way astronomy expresses it.
 *
 * The simulation's clock is `simTimeSeconds`: an f64 count of seconds since the
 * J2000.0 epoch, 2000-01-01 12:00:00 TT, which is Julian Date 2451545.0. Seconds
 * since an epoch is the only representation that stays exact under arithmetic —
 * a Julian Date carries about 2.4 million in its integer part, which leaves an
 * f64 roughly 0.01 ms of resolution, and calendar dates are not a number system
 * at all.
 *
 * Everything else here converts at the edges: to Julian centuries for the
 * orbital element rates, and to a calendar date for the HUD.
 *
 * The project does not model the TT/TAI/UTC offset. Over the 1800–2050 window
 * the propagator is valid for, leap seconds amount to about a minute, which
 * moves the Earth roughly 0.0007° along its orbit — three orders of magnitude
 * inside the accuracy this project claims. `docs/astronomy.md` says so plainly
 * rather than leaving the reader to assume more rigour than is here.
 *
 * @module
 */

import { type Days, type Seconds, SECONDS_PER_DAY, days, seconds } from '@shared/units';

/** Julian Date of the J2000.0 epoch: 2000-01-01 12:00:00 TT. */
export const J2000_JULIAN_DATE = 2_451_545;

/** Days in a Julian century, exactly. */
export const DAYS_PER_JULIAN_CENTURY = 36_525;

/** Milliseconds from the Unix epoch to J2000.0, for conversions to `Date`. */
const UNIX_MS_AT_J2000 = Date.UTC(2000, 0, 1, 12, 0, 0);

/** A calendar instant, broken into the fields a person reads. */
export interface CalendarDate {
  /** Astronomical year numbering: 1 BC is year 0, 2 BC is year −1. */
  readonly year: number;
  /** Month, 1–12. */
  readonly month: number;
  /** Day of month, 1–31. */
  readonly day: number;
  /** Hour, 0–23. */
  readonly hour: number;
  /** Minute, 0–59. */
  readonly minute: number;
  /** Second, 0–59. */
  readonly second: number;
}

/**
 * Converts simulation time to a Julian Date.
 *
 * @param simTimeSeconds - Seconds since J2000.0.
 * @returns The Julian Date.
 */
export function toJulianDate(simTimeSeconds: Seconds): Days {
  return days(J2000_JULIAN_DATE + simTimeSeconds / SECONDS_PER_DAY);
}

/**
 * Converts a Julian Date to simulation time.
 *
 * @param julianDate - The Julian Date.
 * @returns Seconds since J2000.0.
 */
export function fromJulianDate(julianDate: Days): Seconds {
  return seconds((julianDate - J2000_JULIAN_DATE) * SECONDS_PER_DAY);
}

/**
 * Converts simulation time to Julian centuries since J2000.0.
 *
 * This is the argument the secular element rates are expressed against, so it is
 * the unit the propagator actually works in.
 *
 * @param simTimeSeconds - Seconds since J2000.0.
 * @returns Julian centuries since J2000.0. Negative before the epoch.
 */
export function toJulianCenturies(simTimeSeconds: Seconds): number {
  return simTimeSeconds / (SECONDS_PER_DAY * DAYS_PER_JULIAN_CENTURY);
}

/**
 * Converts Julian centuries since J2000.0 back to simulation time.
 *
 * @param centuries - Julian centuries since J2000.0.
 * @returns Seconds since J2000.0.
 */
export function fromJulianCenturies(centuries: number): Seconds {
  return seconds(centuries * SECONDS_PER_DAY * DAYS_PER_JULIAN_CENTURY);
}

/**
 * Converts simulation time to a calendar date.
 *
 * Uses the platform's `Date` purely as a calendar algorithm — the Gregorian
 * civil calendar with proleptic extension is fiddly to get right and this one is
 * already correct — but never as a clock. No ambient time is read.
 *
 * @param simTimeSeconds - Seconds since J2000.0.
 * @returns The calendar fields, in UTC.
 */
export function toCalendarDate(simTimeSeconds: Seconds): CalendarDate {
  // eslint-disable-next-line no-restricted-syntax -- `Date` is used here purely as a calendar algorithm over an explicit instant, never as a clock: no ambient time is read, so the determinism guarantee the rule protects is untouched. https://github.com/karellopez/Demiurge/issues/3
  const instant = new Date(UNIX_MS_AT_J2000 + simTimeSeconds * 1000);
  return {
    year: instant.getUTCFullYear(),
    month: instant.getUTCMonth() + 1,
    day: instant.getUTCDate(),
    hour: instant.getUTCHours(),
    minute: instant.getUTCMinutes(),
    second: instant.getUTCSeconds(),
  };
}

/**
 * Converts a calendar date to simulation time.
 *
 * @param date - The calendar fields, in UTC.
 * @returns Seconds since J2000.0.
 */
export function fromCalendarDate(date: CalendarDate): Seconds {
  const unixMs = Date.UTC(date.year, date.month - 1, date.day, date.hour, date.minute, date.second);
  return seconds((unixMs - UNIX_MS_AT_J2000) / 1000);
}

/**
 * Zero-pads a calendar field so the readout does not jitter as digits change.
 *
 * @param value - The field value.
 * @param width - How many characters wide the field should be.
 * @returns The padded value.
 */
function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

/**
 * Formats simulation time for the heads-up display.
 *
 * ISO 8601 without the `T`, which reads better in a HUD and still sorts.
 *
 * @param simTimeSeconds - Seconds since J2000.0.
 * @returns A string such as `2026-08-30 14:05:00 UTC`.
 */
export function formatSimTime(simTimeSeconds: Seconds): string {
  const date = toCalendarDate(simTimeSeconds);
  return (
    `${pad(date.year, 4)}-${pad(date.month)}-${pad(date.day)} ` +
    `${pad(date.hour)}:${pad(date.minute)}:${pad(date.second)} UTC`
  );
}
