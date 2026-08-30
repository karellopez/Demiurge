/**
 * The facts a body's stats card shows.
 *
 * All derived, none stored: every number here comes from the catalogue and the
 * current simulation state, so there is no second copy to fall out of step. The
 * card is the honest answer to "what am I looking at?".
 *
 * Turning these numbers into words is {@link ./body-format}'s job.
 *
 * @module
 */

import { mass, surfaceGravity, type Body } from '@domain/body';
import {
  bodyFrameAt,
  createBodyFrame,
  localSolarTimeHours,
  subStellarPoint,
  surfacePointOf,
} from '@domain/rotation';
import { DAYS_PER_JULIAN_CENTURY } from '@domain/time/julian';
import { createVec3, subtract, type ReadonlyVec3 } from '@shared/math/vec3';
import type { Days, Meters, Seconds } from '@shared/units';

/** Everything the stats card shows about a body. */
export interface BodyFacts {
  /** Distance from the camera. */
  readonly distanceFromCamera: Meters;
  /** Distance from the system's star. Zero for the star itself. */
  readonly distanceFromStar: Meters;
  /** Equatorial radius. */
  readonly radius: Meters;
  /** Mass, in kilograms, derived from the catalogued GM. */
  readonly massKilograms: number;
  /** Acceleration at the equatorial surface, in m/s². */
  readonly surfaceGravityMetersPerSecondSquared: number;
  /** Sidereal rotation period. Negative when the body turns retrograde. */
  readonly rotationPeriod: Days;
  /** Orbital period about its parent, or `undefined` for the root body. */
  readonly orbitalPeriod: Days | undefined;
  /**
   * Local solar time under the camera, in hours, or `undefined` on the star
   * itself, where the idea does not apply.
   */
  readonly localSolarTime: number | undefined;
}

/**
 * Computes a body's orbital period from its mean motion.
 *
 * The mean longitude rate is radians per Julian century, so the period is one
 * turn divided by that rate. Reading it back out of the elements rather than
 * storing it is what keeps the card from disagreeing with the propagator.
 *
 * @param body - The body to measure.
 * @returns The period in days, or `undefined` when the body does not orbit.
 */
export function orbitalPeriodDays(body: Body): Days | undefined {
  const elements = body.orbit;
  if (elements === undefined || elements.meanLongitudeRate === 0) {
    return undefined;
  }
  const centuries = (Math.PI * 2) / Math.abs(elements.meanLongitudeRate);
  return (centuries * DAYS_PER_JULIAN_CENTURY) as Days;
}

/** Everything the facts are derived from: a body, and where things are. */
export interface BodyFactsInput {
  /** The body to describe. */
  readonly body: Body;
  /** Its current heliocentric position, in true metres. */
  readonly bodyPosition: ReadonlyVec3;
  /** The star's current position. */
  readonly starPosition: ReadonlyVec3;
  /** The camera's current position. */
  readonly cameraPosition: ReadonlyVec3;
  /** Seconds since J2000.0, which fixes the body's rotational phase. */
  readonly simTimeSeconds: Seconds;
}

/**
 * Gathers the facts for a body.
 *
 * @param input - The body, the three positions, and the moment.
 * @returns The facts, ready for display.
 */
export function computeBodyFacts(input: BodyFactsInput): BodyFacts {
  const { body, bodyPosition, starPosition, cameraPosition } = input;
  return {
    distanceFromCamera: distanceBetween(bodyPosition, cameraPosition),
    distanceFromStar: distanceBetween(bodyPosition, starPosition),
    radius: body.equatorialRadius,
    massKilograms: mass(body),
    surfaceGravityMetersPerSecondSquared: surfaceGravity(body),
    rotationPeriod: body.rotation.rotationPeriod,
    orbitalPeriod: orbitalPeriodDays(body),
    localSolarTime: localTimeUnderCamera(input),
  };
}

/**
 * Computes local solar time at the point the camera is looking down on.
 *
 * "Local time" on a planet is a fact about a *place*, so the card needs one:
 * the sub-camera point is the honest choice, because it is the piece of ground
 * the player can actually see. On the star itself the idea has no meaning —
 * there is no sub-solar point on the Sun — so it reports nothing rather than
 * inventing a noon.
 *
 * This allocates, and is allowed to: the card is written on a ten-hertz
 * throttle, never on the frame path.
 *
 * @param input - The body, the three positions, and the moment.
 * @returns Local solar time in hours, or `undefined` on a star.
 */
function localTimeUnderCamera(input: BodyFactsInput): number | undefined {
  const { body, bodyPosition, starPosition, cameraPosition } = input;
  if (body.kind === 'star') {
    return undefined;
  }
  const frame = bodyFrameAt(createBodyFrame(), body, input.simTimeSeconds);
  const toCamera = subtract(createVec3(), cameraPosition, bodyPosition);
  const subCamera = surfacePointOf(frame, toCamera);
  const subSolar = subStellarPoint(frame, createVec3(), bodyPosition, starPosition);
  return localSolarTimeHours(subSolar.longitude, subCamera.longitude);
}

/**
 * Measures the distance between two points.
 *
 * @param first - One point.
 * @param second - The other.
 * @returns The distance, in metres.
 */
function distanceBetween(first: ReadonlyVec3, second: ReadonlyVec3): Meters {
  return Math.hypot(first.x - second.x, first.y - second.y, first.z - second.z) as Meters;
}
