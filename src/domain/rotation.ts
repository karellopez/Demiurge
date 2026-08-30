/**
 * Which way a body is facing, and which part of it is in daylight.
 *
 * A planet drawn without this is a sphere spinning at the right speed with no
 * defined phase: the terminator falls in an arbitrary place, the pole points at
 * ecliptic north instead of wherever it actually points, and Saturn's very
 * visible oblateness is squashed along the wrong axis. All three look nearly
 * right, which is why they survive a long time before anyone notices.
 *
 * The model is the IAU WGCCRE one the catalogue stores:
 *
 * - The north pole is a fixed direction (α₀, δ₀) in the **equatorial** frame.
 * - The prime meridian angle `W = W₀ + Ẇ·d` is measured eastward along the body
 *   equator from its ascending node on the ICRF equator, where `d` is days from
 *   J2000. `Ẇ` is negative for a retrograde rotator, which is what makes Venus
 *   turn the way Venus turns.
 *
 * That gives a full body-fixed basis, and from it the sub-solar point, the
 * terminator and local solar time all follow.
 *
 * @module
 */

import type { Body } from '@domain/body';
import { directionFromEquatorial, equatorialToEcliptic } from '@domain/frames';
import {
  createVec3,
  cross,
  dot,
  set,
  subtract,
  type ReadonlyVec3,
  type Vec3,
} from '@shared/math/vec3';
import { SECONDS_PER_DAY, radians, type Radians, type Seconds } from '@shared/units';

/** A full turn, in radians. */
const TWO_PI = Math.PI * 2;

/** Hours in a solar day, for local time. */
const HOURS_PER_DAY = 24;

/**
 * A body's orientation, as a right-handed basis in ecliptic coordinates.
 *
 * This is the IAU body-fixed frame: `pole` is +Z, `primeMeridian` is +X, and
 * `east` is +Z × +X, which points a quarter turn east of the prime meridian
 * along the equator.
 */
export interface BodyFrame {
  /** The body's north pole. Unit length. */
  readonly pole: Vec3;
  /** Where the body's zero of longitude is pointing right now. Unit length. */
  readonly primeMeridian: Vec3;
  /** A quarter turn east of the prime meridian, completing the triad. */
  readonly east: Vec3;
}

/**
 * Allocates a body frame.
 *
 * @returns A frame aligned with the ecliptic axes, ready to be written into.
 */
export function createBodyFrame(): BodyFrame {
  return {
    pole: createVec3(0, 0, 1),
    primeMeridian: createVec3(1, 0, 0),
    east: createVec3(0, 1, 0),
  };
}

/**
 * Writes a body's north pole direction, in ecliptic coordinates.
 *
 * @param out - The vector to write into.
 * @param body - The body whose pole is wanted.
 * @returns `out`, a unit vector.
 */
export function poleDirection(out: Vec3, body: Body): Vec3 {
  directionFromEquatorial(out, body.rotation.poleRightAscension, body.rotation.poleDeclination);
  return equatorialToEcliptic(out, out);
}

/**
 * Computes the prime meridian angle at a moment.
 *
 * @param body - The rotating body.
 * @param simTimeSeconds - Seconds since J2000.0.
 * @returns `W`, in radians, wrapped into `[0, 2π)`.
 */
export function primeMeridianAngle(body: Body, simTimeSeconds: Seconds): Radians {
  const elapsedDays = simTimeSeconds / SECONDS_PER_DAY;
  const angle = body.rotation.primeMeridian + body.rotation.primeMeridianRate * elapsedDays;
  return radians(((angle % TWO_PI) + TWO_PI) % TWO_PI);
}

/**
 * Writes a body's full orientation at a moment.
 *
 * @param out - The frame to write into. Every vector is overwritten.
 * @param body - The body to orient.
 * @param simTimeSeconds - Seconds since J2000.0.
 * @returns `out`.
 */
export function bodyFrameAt(out: BodyFrame, body: Body, simTimeSeconds: Seconds): BodyFrame {
  poleDirection(out.pole, body);

  // The ascending node of the body equator on the ICRF equator sits at right
  // ascension α₀ + 90°, on the equator, and W is measured east from there.
  const nodeRightAscension = radians(body.rotation.poleRightAscension + Math.PI / 2);
  directionFromEquatorial(out.primeMeridian, nodeRightAscension, radians(0));
  equatorialToEcliptic(out.primeMeridian, out.primeMeridian);

  // Rotate the node about the pole by W. Rodrigues' formula, simplified because
  // the node is already perpendicular to the pole, so its parallel component is
  // zero and the third term drops out.
  cross(out.east, out.pole, out.primeMeridian);
  const angle = primeMeridianAngle(body, simTimeSeconds);
  const cosAngle = Math.cos(angle);
  const sinAngle = Math.sin(angle);
  // Both results are unit length by construction and are not renormalised: the
  // rotated meridian is `cos·a + sin·b` over an orthonormal pair, and east is
  // the cross product of two orthonormal unit vectors. The orthonormality test
  // over the whole catalogue is what holds that claim to account.
  set(
    out.primeMeridian,
    out.primeMeridian.x * cosAngle + out.east.x * sinAngle,
    out.primeMeridian.y * cosAngle + out.east.y * sinAngle,
    out.primeMeridian.z * cosAngle + out.east.z * sinAngle,
  );
  cross(out.east, out.pole, out.primeMeridian);
  return out;
}

/**
 * Planetocentric coordinates of a direction, in the body-fixed frame.
 *
 * Longitude is measured **east** from the prime meridian, which is the IAU
 * convention for every body in this catalogue.
 */
export interface SurfacePoint {
  /** East longitude, in radians, wrapped into `[0, 2π)`. */
  readonly longitude: Radians;
  /** Latitude, in radians, in `[-π/2, π/2]`. */
  readonly latitude: Radians;
}

/**
 * Converts a direction from the body's centre into planetocentric coordinates.
 *
 * @param frame - The body's orientation now.
 * @param direction - A direction from the body's centre, in ecliptic metres. Need
 *   not be normalised.
 * @returns Where that direction pierces the surface.
 */
export function surfacePointOf(frame: BodyFrame, direction: ReadonlyVec3): SurfacePoint {
  const alongPole = dot(direction, frame.pole);
  const alongPrime = dot(direction, frame.primeMeridian);
  const alongEast = dot(direction, frame.east);

  const horizontal = Math.hypot(alongPrime, alongEast);
  const longitude = Math.atan2(alongEast, alongPrime);

  return {
    longitude: radians(((longitude % TWO_PI) + TWO_PI) % TWO_PI),
    latitude: radians(Math.atan2(alongPole, horizontal)),
  };
}

/**
 * Finds the point on a body where its star is directly overhead.
 *
 * @param frame - The body's orientation now.
 * @param scratch - A vector the caller owns, used for the direction to the star.
 * @param bodyPosition - The body's position, in ecliptic metres.
 * @param starPosition - The star's position.
 * @returns The sub-solar point.
 */
export function subStellarPoint(
  frame: BodyFrame,
  scratch: Vec3,
  bodyPosition: ReadonlyVec3,
  starPosition: ReadonlyVec3,
): SurfacePoint {
  subtract(scratch, starPosition, bodyPosition);
  return surfacePointOf(frame, scratch);
}

/**
 * Computes local solar time at a point on a body.
 *
 * Local solar time is the hour angle from local midnight, so noon is when the
 * star is on the meridian. It is what a sundial reads, and it is what makes
 * "sunrise on Mars" a statement about a place and a moment rather than a mood.
 *
 * @param subStellarLongitude - East longitude where the star is overhead.
 * @param longitude - East longitude of the point in question.
 * @returns Local solar time, in hours, in `[0, 24)`.
 */
export function localSolarTimeHours(subStellarLongitude: Radians, longitude: Radians): number {
  const fromNoon = longitude - subStellarLongitude;
  const fraction = (((fromNoon / TWO_PI + 0.5) % 1) + 1) % 1;
  return fraction * HOURS_PER_DAY;
}

/**
 * Reports whether a body turns retrograde.
 *
 * @param body - The body to ask about.
 * @returns True when the prime meridian angle decreases with time.
 */
function isRetrograde(body: Body): boolean {
  return body.rotation.primeMeridianRate < 0;
}

/**
 * Measures a body's axial tilt, the way an almanac quotes it.
 *
 * Two subtleties, and both of them are the difference between a number that
 * matches a reference table and one that is a degree or two out:
 *
 * - It is measured against the body's **own orbit normal**, not ecliptic north.
 *   Every planet's orbit is inclined by a degree or two, which is small enough
 *   to look right and large enough to be wrong.
 * - It is measured to the axis taken in the **direction of rotation**, not to
 *   the IAU north pole. The IAU picks north by which side of the invariable
 *   plane it falls on, so for a retrograde body the two are opposite ends of
 *   the same line. That is why Venus is quoted at 177 degrees rather than 3,
 *   and Uranus at 98 rather than 82: both turn backwards.
 *
 * @param body - The body to measure.
 * @param pole - Its IAU north pole, in ecliptic coordinates.
 * @param normal - Its orbit normal, in ecliptic coordinates.
 * @returns The axial tilt, in radians, in `[0, π]`.
 */
export function axialTilt(body: Body, pole: ReadonlyVec3, normal: ReadonlyVec3): Radians {
  const alignment = dot(pole, normal);
  const cosine = Math.min(1, Math.max(-1, isRetrograde(body) ? -alignment : alignment));
  return radians(Math.acos(cosine));
}
