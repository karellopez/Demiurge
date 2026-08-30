import { describe, expect, it } from 'vitest';

import { mass, type Body } from '@domain/body';
import {
  formatDistance,
  formatMass,
  formatPeriod,
  formatRadius,
  formatSurfaceGravity,
  orbitalPeriodDays,
} from '@domain/body-facts';
import type { OrbitalElements } from '@domain/orbits/elements';
import { METERS_PER_AU, astronomicalUnits, days, meters, radians } from '@shared/units';
import type { GravitationalParameter } from '@shared/units';

/**
 * The boundaries the formatters switch units at.
 *
 * They are duplicated here rather than exported from the module under test. A
 * boundary is part of what the function promises, so a test that reads the
 * constant back out of the implementation cannot notice it moving.
 */
const AU_THRESHOLD_METERS = 0.01 * METERS_PER_AU;

/** Above this many days a period is quoted in years. */
const YEAR_THRESHOLD_DAYS = 900;

/**
 * Elements with a given mean-longitude rate and nothing else that matters.
 *
 * @param meanLongitudeRate - Radians per Julian century.
 * @returns Elements the period can be read out of.
 */
function elementsWithRate(meanLongitudeRate: number): OrbitalElements {
  return {
    semiMajorAxis: astronomicalUnits(1),
    eccentricity: 0,
    inclination: radians(0),
    meanLongitude: radians(0),
    longitudeOfPerihelion: radians(0),
    longitudeOfAscendingNode: radians(0),
    semiMajorAxisRate: astronomicalUnits(0),
    eccentricityRate: 0,
    inclinationRate: radians(0),
    meanLongitudeRate: radians(meanLongitudeRate),
    longitudeOfPerihelionRate: radians(0),
    longitudeOfAscendingNodeRate: radians(0),
  };
}

/**
 * A minimal body, with whatever orbit the test needs.
 *
 * @param orbit - The orbit, or `undefined` for a body that does not orbit.
 * @returns A body the fact functions can read.
 */
function bodyWithOrbit(orbit: OrbitalElements | undefined): Body {
  return {
    id: 'test',
    name: 'Test',
    kind: 'planet',
    parentId: undefined,
    equatorialRadius: meters(1e6),
    polarRadius: meters(1e6),
    gravitationalParameter: 1 as GravitationalParameter,
    rotation: {
      poleRightAscension: radians(0),
      poleDeclination: radians(Math.PI / 2),
      primeMeridian: radians(0),
      primeMeridianRate: radians(1),
      rotationPeriod: days(1),
    },
    albedo: 0.3,
    rings: undefined,
    orbit,
  };
}

describe('reading a period back out of the elements', () => {
  it('reports no period for a body that does not orbit', () => {
    expect(orbitalPeriodDays(bodyWithOrbit(undefined))).toBeUndefined();
  });

  it('reports no period for an orbit that does not advance', () => {
    // A rate of zero is not a period of infinity; it means the fit has no
    // motion in it, and dividing by it would print `Infinity days`.
    expect(orbitalPeriodDays(bodyWithOrbit(elementsWithRate(0)))).toBeUndefined();
  });

  it('reads a retrograde rate as a positive period', () => {
    const forward = orbitalPeriodDays(bodyWithOrbit(elementsWithRate(Math.PI * 2)));
    const backward = orbitalPeriodDays(bodyWithOrbit(elementsWithRate(-Math.PI * 2)));
    expect(forward).toBeCloseTo(36_525, 6);
    expect(backward).toBe(forward);
  });
});

describe('where a distance changes unit', () => {
  it('switches to astronomical units exactly at the threshold, not past it', () => {
    expect(formatDistance(AU_THRESHOLD_METERS)).toBe('0.010 au');
    expect(formatDistance(AU_THRESHOLD_METERS - 1)).toContain('km');
  });

  it('switches to kilometres exactly at a kilometre, not past it', () => {
    expect(formatDistance(1000)).toBe('1 km');
    expect(formatDistance(999)).toBe('999 m');
  });

  it('groups thousands so a nine-figure number can be read', () => {
    expect(formatDistance(1_234_567_000)).toBe('1,234,567 km');
  });

  it('refuses to invent a number for a non-finite distance', () => {
    expect(formatDistance(NaN)).toBe('—');
    expect(formatDistance(Infinity)).toBe('—');
  });
});

describe('where a period changes unit', () => {
  it('has no period at all to report for undefined', () => {
    expect(formatPeriod(undefined)).toBe('—');
  });

  it('has no period at all to report for a non-finite one', () => {
    expect(formatPeriod(NaN)).toBe('—');
    expect(formatPeriod(Infinity)).toBe('—');
  });

  it('switches to years exactly at the threshold, not past it', () => {
    expect(formatPeriod(YEAR_THRESHOLD_DAYS)).toBe('2.5 years');
    expect(formatPeriod(YEAR_THRESHOLD_DAYS - 1)).toBe('899.00 days');
  });

  it('switches to days exactly at two days, not past it', () => {
    expect(formatPeriod(2)).toBe('2.00 days');
    expect(formatPeriod(1.999)).toBe('47.98 hours');
  });

  it('calls a negative period retrograde, and zero neither way', () => {
    expect(formatPeriod(-243.02)).toBe('243.02 days retrograde');
    expect(formatPeriod(0)).toBe('0.00 hours');
  });

  it('divides by the Julian year rather than multiplying by it', () => {
    expect(formatPeriod(365.25 * 165)).toBe('165.0 years');
  });
});

describe('surface gravity', () => {
  it('gives both the absolute figure and the ratio to Earth', () => {
    expect(formatSurfaceGravity(9.80665)).toBe('9.81 m/s² · 1.00g');
  });

  it('refuses to invent a number for a non-finite gravity', () => {
    expect(formatSurfaceGravity(NaN)).toBe('—');
  });
});

describe('a radius', () => {
  it('keeps a decimal below a hundred kilometres, where one matters', () => {
    expect(formatRadius(11_267)).toBe('11.3 km');
  });

  it('drops the decimal exactly at a hundred kilometres, not past it', () => {
    expect(formatRadius(100_000)).toBe('100 km');
    expect(formatRadius(99_900)).toBe('99.9 km');
  });

  it('refuses to invent a number for a non-finite radius', () => {
    expect(formatRadius(NaN)).toBe('—');
  });
});

describe('a mass', () => {
  it('reads in scientific notation, because the range is thirty decades', () => {
    expect(formatMass(5.972e24)).toBe('5.97 × 10²⁴ kg');
    expect(formatMass(1.9885e30)).toBe('1.99 × 10³⁰ kg');
  });

  it('handles a mantissa that rounds up to ten without losing the exponent', () => {
    expect(formatMass(9.999e15)).toBe('10.00 × 10¹⁵ kg');
  });

  it('refuses to invent a number for a mass that is not one', () => {
    expect(formatMass(NaN)).toBe('—');
    expect(formatMass(0)).toBe('—');
    expect(formatMass(-1)).toBe('—');
  });

  it('reads a sub-kilogram mass with a negative exponent', () => {
    expect(formatMass(0.5)).toBe('5.00 × 10⁻¹ kg');
  });
});

describe('mass derived from GM', () => {
  it('recovers Earth from its standard gravitational parameter', () => {
    // GM = 398600.4355 km^3/s^2 is the measured quantity; the mass follows.
    expect(mass(bodyWithOrbit(undefined))).toBeGreaterThan(0);
    expect(
      mass({
        ...bodyWithOrbit(undefined),
        gravitationalParameter: 398_600.4355 as GravitationalParameter,
      }),
    ).toBeCloseTo(5.972e24, -21);
  });
});
