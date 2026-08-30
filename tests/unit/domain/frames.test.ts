import { describe, expect, it } from 'vitest';

import {
  OBLIQUITY_J2000,
  directionFromEquatorial,
  eclipticToEquatorial,
  equatorialToEcliptic,
} from '@domain/frames';
import { createVec3, dot, length, type ReadonlyVec3 } from '@shared/math/vec3';
import { degrees, degreesToRadians, radians, radiansToDegrees } from '@shared/units';

/**
 * The angle between two directions, in degrees.
 *
 * @param a - One direction.
 * @param b - The other.
 * @returns The angle between them.
 */
function angleBetweenDegrees(a: ReadonlyVec3, b: ReadonlyVec3): number {
  const cosine = dot(a, b) / (length(a) * length(b));
  return radiansToDegrees(radians(Math.acos(Math.min(1, Math.max(-1, cosine)))));
}

describe('the obliquity', () => {
  it('is the IAU 2006 value, to the arcsecond', () => {
    expect(radiansToDegrees(OBLIQUITY_J2000)).toBeCloseTo(23.439291, 6);
  });
});

describe('the rotation between the frames', () => {
  it('leaves the vernal equinox alone, which is the axis it turns about', () => {
    const out = equatorialToEcliptic(createVec3(), createVec3(1, 0, 0));
    expect([out.x, out.y, out.z]).toStrictEqual([1, 0, 0]);
  });

  it('takes the equatorial pole to the obliquity from ecliptic north', () => {
    // Earth's own axis is the definition of the equatorial pole, so the angle
    // between the two frames' poles is Earth's axial tilt.
    const out = equatorialToEcliptic(createVec3(), createVec3(0, 0, 1));
    expect(angleBetweenDegrees(out, createVec3(0, 0, 1))).toBeCloseTo(23.439291, 5);
  });

  it('takes the ecliptic pole to (0, -sin e, cos e) going the other way', () => {
    const out = eclipticToEquatorial(createVec3(), createVec3(0, 0, 1));
    expect(out.x).toBeCloseTo(0, 12);
    expect(out.y).toBeCloseTo(-Math.sin(OBLIQUITY_J2000), 12);
    expect(out.z).toBeCloseTo(Math.cos(OBLIQUITY_J2000), 12);
  });

  it('round-trips', () => {
    const start = createVec3(0.31, -0.72, 0.618);
    const back = eclipticToEquatorial(createVec3(), equatorialToEcliptic(createVec3(), start));
    expect(back.x).toBeCloseTo(start.x, 12);
    expect(back.y).toBeCloseTo(start.y, 12);
    expect(back.z).toBeCloseTo(start.z, 12);
  });

  it('preserves length, because it is a rotation and not a shear', () => {
    const start = createVec3(3, -4, 12);
    expect(length(equatorialToEcliptic(createVec3(), start))).toBeCloseTo(13, 12);
  });
});

describe('a direction from a right ascension and declination', () => {
  it('puts zero, zero at the vernal equinox', () => {
    const out = directionFromEquatorial(createVec3(), radians(0), radians(0));
    expect([out.x, out.y, out.z]).toStrictEqual([1, 0, 0]);
  });

  it('puts a declination of ninety degrees at the equatorial pole', () => {
    const out = directionFromEquatorial(createVec3(), radians(1.234), radians(Math.PI / 2));
    expect(out.z).toBeCloseTo(1, 12);
    expect(Math.hypot(out.x, out.y)).toBeCloseTo(0, 12);
  });

  it('is always a unit vector', () => {
    const out = directionFromEquatorial(
      createVec3(),
      degreesToRadians(degrees(212.7)),
      degreesToRadians(degrees(-41.3)),
    );
    expect(length(out)).toBeCloseTo(1, 12);
  });
});
