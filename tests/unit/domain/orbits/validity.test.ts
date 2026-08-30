import { describe, expect, it } from 'vitest';

import { FIT_FIRST_YEAR, FIT_LAST_YEAR, isWithinFittedWindow } from '@domain/orbits/validity';
import { fromCalendarDate } from '@domain/time/julian';
import type { Seconds } from '@shared/units';

/**
 * Simulation time at midday UTC on the first of January of a year.
 *
 * @param year - The calendar year.
 * @returns Seconds since J2000.0.
 */
function atNewYear(year: number): Seconds {
  return fromCalendarDate({ year, month: 1, day: 1, hour: 12, minute: 0, second: 0 });
}

describe('the fitted window', () => {
  it('covers the epoch, which is where a session starts', () => {
    expect(isWithinFittedWindow(atNewYear(2000))).toBe(true);
  });

  it('covers both ends of the published fit, whole years at each end', () => {
    // Standish states the fit as "1800 AD - 2050 AD", so the last day of 2050 is
    // inside it and the first day of 2051 is not.
    expect(isWithinFittedWindow(atNewYear(FIT_FIRST_YEAR))).toBe(true);
    expect(isWithinFittedWindow(atNewYear(FIT_LAST_YEAR))).toBe(true);
    expect(
      isWithinFittedWindow(
        fromCalendarDate({
          year: FIT_LAST_YEAR,
          month: 12,
          day: 31,
          hour: 23,
          minute: 59,
          second: 59,
        }),
      ),
    ).toBe(true);
  });

  it('excludes the year before the fit begins', () => {
    expect(isWithinFittedWindow(atNewYear(FIT_FIRST_YEAR - 1))).toBe(false);
  });

  it('excludes the year after it ends', () => {
    expect(isWithinFittedWindow(atNewYear(FIT_LAST_YEAR + 1))).toBe(false);
  });

  it('excludes the far future, which twenty seconds of time warp reaches', () => {
    // A year a second for a minute is sixty years; a minute at the top of the
    // ladder leaves the window and keeps going.
    expect(isWithinFittedWindow(atNewYear(4000))).toBe(false);
    expect(isWithinFittedWindow(atNewYear(-1000))).toBe(false);
  });
});
