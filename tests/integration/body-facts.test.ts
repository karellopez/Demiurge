import { describe, expect, it } from 'vitest';

import { computeBodyFacts, orbitalPeriodDays } from '@domain/body-facts';
import {
  formatDistance,
  formatPeriod,
  formatRadius,
  formatSurfaceGravity,
} from '@domain/body-format';
import { poleDirection } from '@domain/rotation';
import { buildCatalog } from '@features/space/body-catalog';
import type { RawCatalog } from '@features/space/catalog-schema';
import { createSystemState } from '@features/space/propagate-system';
import { createVec3, cross, length, normalize } from '@shared/math/vec3';
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
    const facts = computeBodyFacts({
      body: catalog.byId('earth')!,
      bodyPosition: earth,
      starPosition: sun,
      cameraPosition: createVec3(),
      simTimeSeconds: seconds(0),
    });
    expect(facts.distanceFromStar / METERS_PER_AU).toBeCloseTo(1, 1);
  });

  it('measures the distance to the camera, not to anything else', () => {
    const earth = system.readPosition('earth', createVec3());
    const camera = createVec3(earth.x + 1e9, earth.y, earth.z);
    const facts = computeBodyFacts({
      body: catalog.byId('earth')!,
      bodyPosition: earth,
      starPosition: createVec3(),
      cameraPosition: camera,
      simTimeSeconds: seconds(0),
    });
    expect(facts.distanceFromCamera).toBeCloseTo(1e9, 0);
  });

  it('gives the Sun no distance from itself', () => {
    const sun = system.readPosition('sun', createVec3());
    const facts = computeBodyFacts({
      body: catalog.byId('sun')!,
      bodyPosition: sun,
      starPosition: sun,
      cameraPosition: createVec3(),
      simTimeSeconds: seconds(0),
    });
    expect(facts.distanceFromStar).toBe(0);
  });

  it('carries the body radius and surface gravity through', () => {
    const facts = computeBodyFacts({
      body: catalog.byId('mars')!,
      bodyPosition: createVec3(),
      starPosition: createVec3(),
      cameraPosition: createVec3(),
      simTimeSeconds: seconds(0),
    });
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

/**
 * Local time under a camera parked at a fixed point in space.
 *
 * @param when - Seconds since J2000.0.
 * @returns Local solar time under that camera, in hours.
 */
function localTimeFromAFixedCamera(when: number): number {
  system.update(seconds(when));
  return computeBodyFacts({
    body: catalog.byId('earth')!,
    bodyPosition: system.readPosition('earth', createVec3()),
    starPosition: system.readPosition('sun', createVec3()),
    cameraPosition: createVec3(3e11, 0, 0),
    simTimeSeconds: seconds(when),
  }).localSolarTime!;
}

describe('local solar time on the card', () => {
  it('has none to report on the Sun, where the idea has no meaning', () => {
    const facts = computeBodyFacts({
      body: catalog.byId('sun')!,
      bodyPosition: system.readPosition('sun', createVec3()),
      starPosition: system.readPosition('sun', createVec3()),
      cameraPosition: createVec3(),
      simTimeSeconds: seconds(0),
    });
    expect(facts.localSolarTime).toBeUndefined();
  });

  it('reports a time on a planet', () => {
    const facts = computeBodyFacts({
      body: catalog.byId('earth')!,
      bodyPosition: system.readPosition('earth', createVec3()),
      starPosition: system.readPosition('sun', createVec3()),
      cameraPosition: createVec3(),
      simTimeSeconds: seconds(0),
    });
    expect(facts.localSolarTime).toBeGreaterThanOrEqual(0);
    expect(facts.localSolarTime).toBeLessThan(24);
  });

  it('reads noon from a camera parked between the body and the Sun', () => {
    const bodyPosition = system.readPosition('mars', createVec3());
    const starPosition = system.readPosition('sun', createVec3());
    // Halfway from Mars to the Sun: the camera is over the sub-solar point.
    const cameraPosition = createVec3(
      (bodyPosition.x + starPosition.x) / 2,
      (bodyPosition.y + starPosition.y) / 2,
      (bodyPosition.z + starPosition.z) / 2,
    );
    const facts = computeBodyFacts({
      body: catalog.byId('mars')!,
      bodyPosition,
      starPosition,
      cameraPosition,
      simTimeSeconds: seconds(0),
    });
    expect(facts.localSolarTime).toBeCloseTo(12, 6);
  });

  it('reads midnight from a camera on the far side', () => {
    const bodyPosition = system.readPosition('mars', createVec3());
    const starPosition = system.readPosition('sun', createVec3());
    const cameraPosition = createVec3(
      bodyPosition.x * 2 - starPosition.x,
      bodyPosition.y * 2 - starPosition.y,
      bodyPosition.z * 2 - starPosition.z,
    );
    const facts = computeBodyFacts({
      body: catalog.byId('mars')!,
      bodyPosition,
      starPosition,
      cameraPosition,
      simTimeSeconds: seconds(0),
    });
    expect(facts.localSolarTime).toBeCloseTo(0, 6);
  });

  it('holds still under a camera that holds still, because both points turn together', () => {
    // The sub-camera point and the sub-solar point are both fixed directions in
    // space, so the body rotating under them changes each longitude by the same
    // amount and leaves the difference — which is what local time is — alone.
    expect(localTimeFromAFixedCamera(6 * 3600)).toBeCloseTo(localTimeFromAFixedCamera(0), 1);
  });

  it('moves six hours when the camera swings a quarter turn about the pole', () => {
    const when = seconds(0);
    system.update(when);
    const bodyPosition = system.readPosition('earth', createVec3());
    const starPosition = system.readPosition('sun', createVec3());
    const pole = poleDirection(createVec3(), catalog.byId('earth')!);

    const readFrom = (cameraPosition: ReturnType<typeof createVec3>): number =>
      computeBodyFacts({
        body: catalog.byId('earth')!,
        bodyPosition,
        starPosition,
        cameraPosition,
        simTimeSeconds: when,
      }).localSolarTime!;

    // Start over the sub-solar point, then rotate the camera a quarter turn east
    // about the body's own axis.
    const toSun = createVec3(
      starPosition.x - bodyPosition.x,
      starPosition.y - bodyPosition.y,
      starPosition.z - bodyPosition.z,
    );
    const east = cross(createVec3(), pole, toSun);
    normalize(east, east);
    const radius = length(toSun);
    const swung = createVec3(
      bodyPosition.x + east.x * radius,
      bodyPosition.y + east.y * radius,
      bodyPosition.z + east.z * radius,
    );

    expect(
      readFrom(swung) - readFrom(createVec3(starPosition.x, starPosition.y, starPosition.z)),
    ).toBeCloseTo(6, 6);
  });
});
