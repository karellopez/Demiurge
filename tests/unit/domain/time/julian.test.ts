import { describe, expect, it } from 'vitest';

import {
  DAYS_PER_JULIAN_CENTURY,
  J2000_JULIAN_DATE,
  formatSimTime,
  fromCalendarDate,
  fromJulianCenturies,
  fromJulianDate,
  toCalendarDate,
  toJulianCenturies,
  toJulianDate,
} from '@domain/time/julian';
import { seconds } from '@shared/units';

describe('the epoch', () => {
  it('is Julian Date 2451545.0', () => {
    expect(J2000_JULIAN_DATE).toBe(2_451_545);
  });

  it('defines a Julian century as exactly 36525 days', () => {
    expect(DAYS_PER_JULIAN_CENTURY).toBe(36_525);
  });

  it('maps simulation time zero onto the epoch', () => {
    expect(toJulianDate(seconds(0))).toBe(J2000_JULIAN_DATE);
    expect(toJulianCenturies(seconds(0))).toBe(0);
  });
});

describe('Julian dates', () => {
  it('advances one day per 86400 seconds', () => {
    expect(toJulianDate(seconds(86_400))).toBe(J2000_JULIAN_DATE + 1);
  });

  it('runs backwards before the epoch', () => {
    expect(toJulianDate(seconds(-86_400))).toBe(J2000_JULIAN_DATE - 1);
  });

  it('round-trips', () => {
    for (const value of [0, 1, -1, 1e6, -1e6, 3.156e9]) {
      expect(fromJulianDate(toJulianDate(seconds(value)))).toBeCloseTo(value, 3);
    }
  });
});

describe('Julian centuries', () => {
  it('reaches one century after 36525 days', () => {
    expect(toJulianCenturies(seconds(36_525 * 86_400))).toBeCloseTo(1, 12);
  });

  it('is negative before the epoch', () => {
    expect(toJulianCenturies(seconds(-36_525 * 86_400))).toBeCloseTo(-1, 12);
  });

  it('round-trips', () => {
    for (const value of [0, 0.5, -1, 2.5]) {
      expect(toJulianCenturies(fromJulianCenturies(value))).toBeCloseTo(value, 12);
    }
  });
});

describe('calendar dates', () => {
  it('places the epoch at noon on the first of January 2000', () => {
    expect(toCalendarDate(seconds(0))).toStrictEqual({
      year: 2000,
      month: 1,
      day: 1,
      hour: 12,
      minute: 0,
      second: 0,
    });
  });

  it('round-trips a date', () => {
    const date = { year: 2026, month: 8, day: 30, hour: 14, minute: 5, second: 30 };
    expect(toCalendarDate(fromCalendarDate(date))).toStrictEqual(date);
  });

  it('handles a leap day', () => {
    const leapDay = { year: 2024, month: 2, day: 29, hour: 0, minute: 0, second: 0 };
    expect(toCalendarDate(fromCalendarDate(leapDay))).toStrictEqual(leapDay);
  });

  it('handles a date before the epoch', () => {
    const past = { year: 1969, month: 7, day: 20, hour: 20, minute: 17, second: 0 };
    expect(toCalendarDate(fromCalendarDate(past))).toStrictEqual(past);
  });

  it('reads no ambient clock, so the same input always gives the same output', () => {
    expect(toCalendarDate(seconds(12_345))).toStrictEqual(toCalendarDate(seconds(12_345)));
  });
});

describe('formatting for the heads-up display', () => {
  it('renders the epoch', () => {
    expect(formatSimTime(seconds(0))).toBe('2000-01-01 12:00:00 UTC');
  });

  it('pads every field so the readout does not jitter', () => {
    const january = fromCalendarDate({
      year: 2026,
      month: 1,
      day: 2,
      hour: 3,
      minute: 4,
      second: 5,
    });
    expect(formatSimTime(january)).toBe('2026-01-02 03:04:05 UTC');
  });

  it('keeps a four-digit year', () => {
    const early = fromCalendarDate({ year: 812, month: 5, day: 6, hour: 0, minute: 0, second: 0 });
    expect(formatSimTime(early)).toMatch(/^0812-05-06/u);
  });
});
