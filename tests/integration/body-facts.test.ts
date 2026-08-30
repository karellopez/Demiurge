import { describe, expect, it } from 'vitest';

import {
  computeBodyFacts,
  formatDistance,
  formatPeriod,
  formatRadius,
  formatSurfaceGravity,
  orbitalPeriodDays,
} from '@domain/body-facts';
import { buildCatalog } from '@features/space/body-catalog';
import type { RawCatalog } from '@features/space/catalog-schema';
import { createSystemState } from '@features/space/propagate-system';
import { createVec3 } from '@shared/math/vec3';
import { METERS_PER_AU, seconds } from '@shared/units';

import rawCatalog from '../../data/bodies.json';

const catalog = buildCatalog(rawCatalog as unknown as RawCatalog);
const system = createSystemState(catalog);
system.update(seconds(0));

describe('orbital periods read back from the elements', () => {
  it('gives Earth a year', () => {
    expect(orbitalPeriodDays(catalog.byId('earth')!)).toBeCloseTo(365.25, 0);
  });

  it('gives Mercury 88 days', () => {
    expect(orbitalPeriodDays(catalog.byId('mercury')!)).toBeCloseTo(88, 0);
  });

  it('gives Neptune about 165 years', () => {
    expect(orbitalPeriodDays(catalog.byId('neptune')!)! / 365.25).toBeCloseTo(165, 0);
  });

  it('gives the Moon about 27 days', () => {
    expect(orbitalPeriodDays(catalog.byId('moon')!)).toBeCloseTo(27, 0);
  });

  it('gives Titan about 16 days', () => {
    expect(orbitalPeriodDays(catalog.byId('titan')!)).toBeCloseTo(15.95, 1);
  });

  it('gives the Sun no orbital period at all', () => {
    expect(orbitalPeriodDays(catalog.byId('sun')!)).toBeUndefined();
  });
});

describe('the facts a card shows', () => {
  it('puts Earth about one astronomical unit from the Sun', () => {
    const earth = system.readPosition('earth', createVec3());
    const sun = system.readPosition('sun', createVec3());
    const facts = computeBodyFacts(catalog.byId('earth')!, earth, sun, createVec3());
    expect(facts.distanceFromStar / METERS_PER_AU).toBeCloseTo(1, 1);
  });

  it('measures the distance to the camera, not to anything else', () => {
    const earth = system.readPosition('earth', createVec3());
    const camera = createVec3(earth.x + 1e9, earth.y, earth.z);
    const facts = computeBodyFacts(catalog.byId('earth')!, earth, createVec3(), camera);
    expect(facts.distanceFromCamera).toBeCloseTo(1e9, 0);
  });

  it('gives the Sun no distance from itself', () => {
    const sun = system.readPosition('sun', createVec3());
    const facts = computeBodyFacts(catalog.byId('sun')!, sun, sun, createVec3());
    expect(facts.distanceFromStar).toBe(0);
  });

  it('carries the body radius and surface gravity through', () => {
    const facts = computeBodyFacts(catalog.byId('mars')!, createVec3(), createVec3(), createVec3());
    expect(facts.radius).toBeCloseTo(3_396_190, 0);
    expect(facts.surfaceGravityMetersPerSecondSquared).toBeCloseTo(3.72, 1);
  });
});

describe('formatting for a person', () => {
  it('uses astronomical units for interplanetary distances', () => {
    expect(formatDistance(METERS_PER_AU)).toBe('1.000 au');
  });

  it('uses kilometres closer in', () => {
    expect(formatDistance(384_400_000)).toContain('km');
  });

  it('uses metres when standing next to something', () => {
    expect(formatDistance(250)).toBe('250 m');
  });

  it('says so when there is nothing to report', () => {
    expect(formatDistance(NaN)).toBe('—');
    expect(formatPeriod(undefined)).toBe('—');
    expect(formatRadius(NaN)).toBe('—');
    expect(formatSurfaceGravity(NaN)).toBe('—');
  });

  it('uses years for a long orbit and days for a short one', () => {
    expect(formatPeriod(60_190)).toContain('years');
    expect(formatPeriod(365.25)).toContain('days');
  });

  it('uses hours for something that turns in less than two days', () => {
    expect(formatPeriod(0.41354)).toContain('hours');
  });

  it('spells out retrograde rather than leaving a minus sign to be missed', () => {
    expect(formatPeriod(-243.018)).toContain('retrograde');
    expect(formatPeriod(243.018)).not.toContain('retrograde');
  });

  it('gives gravity against Earth, which is the only useful comparison', () => {
    const formatted = formatSurfaceGravity(9.80665);
    expect(formatted).toContain('9.81 m/s²');
    expect(formatted).toContain('1.00g');
  });

  it('gives a small body a radius with a decimal and a large one without', () => {
    expect(formatRadius(11_267)).toBe('11.3 km');
    expect(formatRadius(6_378_137)).toContain('6,378');
  });
});
