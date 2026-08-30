import { describe, expect, it } from 'vitest';

import {
  METERS_PER_AU,
  SECONDS_PER_DAY,
  astronomicalUnits,
  auToMeters,
  days,
  daysToSeconds,
  degrees,
  degreesToRadians,
  gravitationalParameter,
  kilograms,
  kilometers,
  kilometersToMeters,
  meters,
  metersPerSecond,
  metersToAu,
  metersToKilometers,
  radians,
  radiansToDegrees,
  seconds,
  secondsToDays,
  toRawMeters,
  toRawRadians,
  toRawSeconds,
} from '@shared/units';

describe('unit constants', () => {
  it('defines the astronomical unit as the exact IAU 2012 value', () => {
    expect(METERS_PER_AU).toBe(149_597_870_700);
  });

  it('defines a day as exactly 86400 seconds', () => {
    expect(SECONDS_PER_DAY).toBe(86_400);
  });
});

describe('length conversions', () => {
  it('converts kilometres to metres', () => {
    expect(toRawMeters(kilometersToMeters(kilometers(6371)))).toBe(6_371_000);
  });

  it('converts metres to kilometres', () => {
    expect(metersToKilometers(meters(6_371_000))).toBe(6371);
  });

  it('places Earth at one astronomical unit from the Sun', () => {
    expect(toRawMeters(auToMeters(astronomicalUnits(1)))).toBe(METERS_PER_AU);
  });

  it('reports Neptune at roughly thirty astronomical units', () => {
    expect(metersToAu(meters(4.5e12))).toBeCloseTo(30.08, 2);
  });

  it('round-trips a length through astronomical units without loss', () => {
    const original = meters(1.234e11);
    expect(toRawMeters(auToMeters(metersToAu(original)))).toBeCloseTo(original, 3);
  });
});

describe('time conversions', () => {
  it('converts days to seconds', () => {
    expect(toRawSeconds(daysToSeconds(days(1)))).toBe(86_400);
  });

  it('converts seconds to days', () => {
    expect(secondsToDays(seconds(172_800))).toBe(2);
  });
});

describe('angle conversions', () => {
  it('converts a half turn in degrees to pi radians', () => {
    expect(toRawRadians(degreesToRadians(degrees(180)))).toBeCloseTo(Math.PI, 12);
  });

  it('converts pi radians back to a half turn in degrees', () => {
    expect(radiansToDegrees(radians(Math.PI))).toBeCloseTo(180, 12);
  });

  it('round-trips an arbitrary angle', () => {
    expect(radiansToDegrees(degreesToRadians(degrees(23.4392)))).toBeCloseTo(23.4392, 12);
  });
});

describe('branding constructors', () => {
  it('leaves the underlying number untouched', () => {
    expect(kilograms(5.972e24)).toBe(5.972e24);
    expect(gravitationalParameter(3.986004418e14)).toBe(3.986004418e14);
    expect(metersPerSecond(7660)).toBe(7660);
  });
});
