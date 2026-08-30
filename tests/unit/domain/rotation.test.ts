import { describe, expect, it } from 'vitest';

import type { Body } from '@domain/body';
import { axialTilt, primeMeridianAngle } from '@domain/rotation';
import { createVec3 } from '@shared/math/vec3';
import { days, meters, radians, radiansToDegrees, seconds } from '@shared/units';
import type { GravitationalParameter } from '@shared/units';

/**
 * A body with a chosen rotation rate and nothing else that matters.
 *
 * @param primeMeridianRateDegreesPerDay - Degrees of spin per day. Negative is
 *   retrograde; zero is a body that does not turn at all.
 * @returns A body the rotation model can read.
 */
function bodyRotatingAt(primeMeridianRateDegreesPerDay: number): Body {
  return {
    id: 'test',
    name: 'Test',
    kind: 'planet',
    parentId: 'sun',
    equatorialRadius: meters(1e6),
    polarRadius: meters(1e6),
    gravitationalParameter: 1 as GravitationalParameter,
    rotation: {
      poleRightAscension: radians(0),
      poleDeclination: radians(Math.PI / 2),
      primeMeridian: radians(0.4),
      primeMeridianRate: radians((primeMeridianRateDegreesPerDay * Math.PI) / 180),
      rotationPeriod: days(1),
    },
    albedo: 0.3,
    rings: undefined,
    orbit: undefined,
  };
}

describe('the prime meridian angle', () => {
  it('stays inside one turn however far back or forward time runs', () => {
    // Wrapping a negative remainder is the whole reason this is not a bare `%`.
    // At a year a second a session reaches these times in a couple of minutes.
    const forward = bodyRotatingAt(360.9856235);
    const backward = bodyRotatingAt(-1.4813688);
    for (const centuries of [-40, -3, -0.5, 0, 0.5, 3, 40]) {
      const when = seconds(centuries * 36_525 * 86_400);
      for (const body of [forward, backward]) {
        const angle = primeMeridianAngle(body, when);
        expect(angle, `${String(centuries)} centuries`).toBeGreaterThanOrEqual(0);
        expect(angle, `${String(centuries)} centuries`).toBeLessThan(Math.PI * 2);
      }
    }
  });

  it('starts at the catalogued angle at the epoch', () => {
    expect(primeMeridianAngle(bodyRotatingAt(0), seconds(0))).toBeCloseTo(0.4, 12);
  });
});

describe('axial tilt and the direction of spin', () => {
  const pole = createVec3(0, 0, 1);
  const normal = createVec3(0, Math.sin(0.3), Math.cos(0.3));

  it('measures straight to the pole for a prograde rotator', () => {
    expect(axialTilt(bodyRotatingAt(360), pole, normal)).toBeCloseTo(0.3, 12);
  });

  it('measures to the other end of the axis for a retrograde one', () => {
    expect(axialTilt(bodyRotatingAt(-360), pole, normal)).toBeCloseTo(Math.PI - 0.3, 12);
  });

  it('treats a body that does not turn as prograde rather than upside down', () => {
    // A rate of exactly zero is not retrograde: there is no direction of spin to
    // be opposite to, and flipping the axis would report a tilt of 180 degrees
    // for a body whose pole points straight at its own orbit normal.
    expect(radiansToDegrees(axialTilt(bodyRotatingAt(0), pole, normal))).toBeCloseTo(17.19, 2);
  });

  it('never reports a tilt outside half a turn', () => {
    for (const rate of [-720, -1, 0, 1, 720]) {
      const tilt = axialTilt(bodyRotatingAt(rate), pole, createVec3(1, 0, 0));
      expect(tilt).toBeGreaterThanOrEqual(0);
      expect(tilt).toBeLessThanOrEqual(Math.PI);
    }
  });
});
