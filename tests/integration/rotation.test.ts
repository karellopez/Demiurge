import { describe, expect, it } from 'vitest';

import { eclipticToEquatorial } from '@domain/frames';
import { evaluateElements, orbitNormal } from '@domain/orbits/propagate';
import {
  axialTilt,
  bodyFrameAt,
  createBodyFrame,
  localSolarTimeHours,
  poleDirection,
  primeMeridianAngle,
  subStellarPoint,
  surfacePointOf,
} from '@domain/rotation';
import { buildCatalog } from '@features/space/body-catalog';
import type { RawCatalog } from '@features/space/catalog-schema';
import { createSystemState } from '@features/space/propagate-system';
import { createVec3, dot, length } from '@shared/math/vec3';
import { radians, radiansToDegrees, seconds, type Seconds } from '@shared/units';

import rawCatalog from '../../data/bodies.json';

/**
 * The IAU rotation model against the real catalogue.
 *
 * Every number checked here is one an almanac also publishes, which is the
 * point: an axial tilt or a sidereal day is a fact about the solar system, and
 * a model that reproduces the catalogue but not the fact has only proved that
 * the conversion is self-consistent.
 */

const catalog = buildCatalog(rawCatalog as unknown as RawCatalog);
const system = createSystemState(catalog);

/** A day, in seconds, for stepping the prime meridian. */
const DAY = 86_400;

/**
 * A body's axial tilt, against its own orbit and in its own rotation direction.
 *
 * @param bodyId - The body to measure.
 * @returns The axial tilt, in degrees.
 */
function axialTiltDegrees(bodyId: string): number {
  const body = catalog.byId(bodyId)!;
  const pole = poleDirection(createVec3(), body);
  const normal = orbitNormal(createVec3(), evaluateElements(body.orbit!, 0));
  return radiansToDegrees(axialTilt(body, pole, normal));
}

describe('axial tilts, which an almanac also publishes', () => {
  it('gives Earth 23.4 degrees', () => {
    expect(axialTiltDegrees('earth')).toBeCloseTo(23.44, 1);
  });

  it('gives Mars 25.2 degrees, which is why Mars has seasons', () => {
    expect(axialTiltDegrees('mars')).toBeCloseTo(25.19, 1);
  });

  it('gives Uranus 97.8 degrees, so it rolls rather than spins', () => {
    expect(axialTiltDegrees('uranus')).toBeCloseTo(97.77, 1);
  });

  it('gives Venus 177.4 degrees, which is the tilt way of saying retrograde', () => {
    expect(axialTiltDegrees('venus')).toBeCloseTo(177.36, 1);
  });

  it('gives Jupiter 3.1 degrees, which is why Jupiter has none to speak of', () => {
    expect(axialTiltDegrees('jupiter')).toBeCloseTo(3.13, 1);
  });

  it('gives Saturn 26.7 degrees, which is the tilt its rings are drawn at', () => {
    expect(axialTiltDegrees('saturn')).toBeCloseTo(26.73, 1);
  });
});

describe("Earth's pole, checked in the frame the IAU publishes it in", () => {
  it('comes back out at right ascension zero and declination ninety', () => {
    const pole = poleDirection(createVec3(), catalog.byId('earth')!);
    const equatorial = eclipticToEquatorial(createVec3(), pole);
    expect(equatorial.z).toBeCloseTo(1, 9);
    expect(Math.hypot(equatorial.x, equatorial.y)).toBeCloseTo(0, 9);
  });
});

describe('the prime meridian', () => {
  it('turns once per sidereal day for Earth', () => {
    const earth = catalog.byId('earth')!;
    const start = primeMeridianAngle(earth, seconds(0));
    const later = primeMeridianAngle(earth, seconds(earth.rotation.rotationPeriod * DAY));
    expect(radiansToDegrees(radians(Math.abs(later - start)))).toBeLessThan(0.01);
  });

  it('turns the other way on Venus', () => {
    const venus = catalog.byId('venus')!;
    const start = primeMeridianAngle(venus, seconds(0));
    const later = primeMeridianAngle(venus, seconds(DAY));
    // Venus turns backwards, so a day of elapsed time takes the prime meridian
    // angle down rather than up, by its published rate.
    expect(radiansToDegrees(radians(later - start))).toBeCloseTo(-1.4813688, 4);
  });

  it("puts Earth's prime meridian near the sidereal angle at the epoch", () => {
    // At J2000 Greenwich mean sidereal time is 280.46 degrees. The IAU model
    // measures W from the node at right ascension 90, so the prime meridian's
    // own right ascension is 90 + W, and the two must agree.
    const frame = bodyFrameAt(createBodyFrame(), catalog.byId('earth')!, seconds(0));
    const equatorial = eclipticToEquatorial(createVec3(), frame.primeMeridian);
    const rightAscension = radiansToDegrees(
      radians(
        ((Math.atan2(equatorial.y, equatorial.x) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2),
      ),
    );
    expect(rightAscension).toBeCloseTo(280.46, 0);
  });
});

describe('the body frame', () => {
  it('is orthonormal for every body in the catalogue', () => {
    const frame = createBodyFrame();
    for (const body of catalog.all) {
      bodyFrameAt(frame, body, seconds(1.234e8));
      expect(length(frame.pole), `${body.name} pole`).toBeCloseTo(1, 9);
      expect(length(frame.primeMeridian), `${body.name} prime meridian`).toBeCloseTo(1, 9);
      expect(length(frame.east), `${body.name} east`).toBeCloseTo(1, 9);
      expect(dot(frame.pole, frame.primeMeridian), `${body.name} pole vs meridian`).toBeCloseTo(
        0,
        9,
      );
      expect(dot(frame.pole, frame.east), `${body.name} pole vs east`).toBeCloseTo(0, 9);
      expect(dot(frame.primeMeridian, frame.east), `${body.name} meridian vs east`).toBeCloseTo(
        0,
        9,
      );
    }
  });

  it('is right-handed, so east really is east', () => {
    const frame = bodyFrameAt(createBodyFrame(), catalog.byId('earth')!, seconds(0));
    // east = pole x primeMeridian, so (primeMeridian x east) must be the pole.
    const reconstructed = createVec3(
      frame.primeMeridian.y * frame.east.z - frame.primeMeridian.z * frame.east.y,
      frame.primeMeridian.z * frame.east.x - frame.primeMeridian.x * frame.east.z,
      frame.primeMeridian.x * frame.east.y - frame.primeMeridian.y * frame.east.x,
    );
    expect(dot(reconstructed, frame.pole)).toBeCloseTo(1, 9);
  });

  it('reads the prime meridian as longitude zero and the pole as ninety north', () => {
    const frame = bodyFrameAt(createBodyFrame(), catalog.byId('mars')!, seconds(5e7));
    expect(surfacePointOf(frame, frame.primeMeridian).longitude).toBeCloseTo(0, 9);
    expect(radiansToDegrees(surfacePointOf(frame, frame.pole).latitude)).toBeCloseTo(90, 9);
    expect(radiansToDegrees(surfacePointOf(frame, frame.east).longitude)).toBeCloseTo(90, 9);
  });
});

/**
 * Where the Sun is overhead on a body, at a moment.
 *
 * @param bodyId - The body to stand on.
 * @param simTimeSeconds - Seconds since J2000.0.
 * @returns The sub-solar point.
 */
function subSolar(bodyId: string, simTimeSeconds: Seconds) {
  system.update(simTimeSeconds);
  const body = catalog.byId(bodyId)!;
  const frame = bodyFrameAt(createBodyFrame(), body, simTimeSeconds);
  return subStellarPoint(
    frame,
    createVec3(),
    system.readPosition(bodyId, createVec3()),
    system.readPosition(catalog.root.id, createVec3()),
  );
}

describe('the sub-solar point', () => {
  it("tracks Earth's seasons: the Sun is over the tropics and never past them", () => {
    // A year of samples. The sub-solar latitude is the declination of the Sun,
    // which is what the tropics are defined by, so it must stay inside the
    // axial tilt and must actually reach it.
    let highest = -90;
    let lowest = 90;
    for (let day = 0; day < 366; day += 1) {
      const latitude = radiansToDegrees(subSolar('earth', seconds(day * DAY)).latitude);
      highest = Math.max(highest, latitude);
      lowest = Math.min(lowest, latitude);
    }
    expect(highest).toBeCloseTo(23.44, 0);
    expect(lowest).toBeCloseTo(-23.44, 0);
  });

  it('circles the body once a day, so longitude sweeps the whole range', () => {
    const longitudes: number[] = [];
    for (let hour = 0; hour < 24; hour += 1) {
      longitudes.push(radiansToDegrees(subSolar('earth', seconds(hour * 3600)).longitude));
    }
    expect(Math.min(...longitudes)).toBeLessThan(20);
    expect(Math.max(...longitudes)).toBeGreaterThan(340);
  });

  it('barely moves in a day on Venus, which takes 243 of them to turn', () => {
    const start = radiansToDegrees(subSolar('venus', seconds(0)).longitude);
    const later = radiansToDegrees(subSolar('venus', seconds(DAY)).longitude);
    expect(Math.abs(later - start)).toBeLessThan(4);
  });
});

describe('local solar time', () => {
  it('is noon where the star is overhead', () => {
    expect(localSolarTimeHours(radians(1.1), radians(1.1))).toBeCloseTo(12, 12);
  });

  it('is midnight on the far side', () => {
    expect(localSolarTimeHours(radians(0), radians(Math.PI))).toBeCloseTo(0, 12);
  });

  it('runs six hours per quarter turn, eastward', () => {
    expect(localSolarTimeHours(radians(0), radians(Math.PI / 2))).toBeCloseTo(18, 12);
    expect(localSolarTimeHours(radians(0), radians(-Math.PI / 2))).toBeCloseTo(6, 12);
  });

  it('stays inside a day however the angles wrap', () => {
    for (let step = -20; step <= 20; step += 1) {
      const hours = localSolarTimeHours(radians(0.3), radians(step * 0.7));
      expect(hours).toBeGreaterThanOrEqual(0);
      expect(hours).toBeLessThan(24);
    }
  });
});

describe('local time on the card, at a place and a moment', () => {
  it('reads about noon under the sub-solar point', () => {
    const when = seconds(4.2e7);
    system.update(when);
    const earth = catalog.byId('earth')!;
    const bodyPosition = system.readPosition('earth', createVec3());
    const starPosition = system.readPosition(catalog.root.id, createVec3());
    const frame = bodyFrameAt(createBodyFrame(), earth, when);
    const subSolarPoint = subStellarPoint(frame, createVec3(), bodyPosition, starPosition);

    // Stand on the sub-solar point: a camera directly along the Sun direction.
    const overhead = createVec3(
      starPosition.x - bodyPosition.x,
      starPosition.y - bodyPosition.y,
      starPosition.z - bodyPosition.z,
    );
    const here = surfacePointOf(frame, overhead);
    expect(localSolarTimeHours(subSolarPoint.longitude, here.longitude)).toBeCloseTo(12, 9);
  });

  it('reads midnight from directly behind the body', () => {
    const when = seconds(4.2e7);
    system.update(when);
    const earth = catalog.byId('earth')!;
    const bodyPosition = system.readPosition('earth', createVec3());
    const starPosition = system.readPosition(catalog.root.id, createVec3());
    const frame = bodyFrameAt(createBodyFrame(), earth, when);
    const subSolarPoint = subStellarPoint(frame, createVec3(), bodyPosition, starPosition);

    const antisolar = createVec3(
      bodyPosition.x - starPosition.x,
      bodyPosition.y - starPosition.y,
      bodyPosition.z - starPosition.z,
    );
    const here = surfacePointOf(frame, antisolar);
    expect(localSolarTimeHours(subSolarPoint.longitude, here.longitude)).toBeCloseTo(0, 9);
  });
});
