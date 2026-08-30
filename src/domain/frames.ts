/**
 * The two reference frames this project uses, and the one rotation between them.
 *
 * Everything the simulation computes lives in the **J2000 ecliptic** frame: the
 * plane of Earth's orbit, with +Z pointing to the ecliptic north pole. Orbital
 * elements are published in it, orbits are propagated in it, and the camera
 * works in it.
 *
 * Body orientations are not. The IAU publishes every rotation axis in the
 * **J2000 equatorial** (ICRF) frame, as a right ascension and declination, and
 * that frame is tilted from the ecliptic by the obliquity — 23.44°, the tilt of
 * Earth's own axis, which is what makes Earth's ecliptic pole coordinates come
 * out as exactly (0°, 90°) equatorial.
 *
 * So the catalogue stores poles as published, and this module is the single
 * place they cross over. Doing the conversion anywhere else, or forgetting it,
 * tilts every body in the system by 23° — which looks almost right, and is the
 * kind of almost that puts a terminator in the wrong place.
 *
 * @module
 */

import { set, type ReadonlyVec3, type Vec3 } from '@shared/math/vec3';
import { degrees, degreesToRadians, type Radians } from '@shared/units';

/**
 * Obliquity of the ecliptic at J2000.0.
 *
 * 23° 26′ 21.406″, from the IAU 2006 precession model. This is the angle the
 * equatorial frame is tilted from the ecliptic one, and it is the only number
 * the conversion below needs.
 */
export const OBLIQUITY_J2000: Radians = degreesToRadians(degrees(23.43929111111111));

/** Cosine of the obliquity, computed once. */
const COS_OBLIQUITY = Math.cos(OBLIQUITY_J2000);

/** Sine of the obliquity, computed once. */
const SIN_OBLIQUITY = Math.sin(OBLIQUITY_J2000);

/**
 * Rotates a direction from the J2000 equatorial frame into the ecliptic one.
 *
 * A rotation about the shared +X axis, which is the vernal equinox and is why
 * the two frames share it. Length is preserved, so a unit vector stays one.
 *
 * @param out - The vector to write into.
 * @param equatorial - The direction in the equatorial frame.
 * @returns `out`.
 */
export function equatorialToEcliptic(out: Vec3, equatorial: ReadonlyVec3): Vec3 {
  const { x, y, z } = equatorial;
  return set(out, x, y * COS_OBLIQUITY + z * SIN_OBLIQUITY, z * COS_OBLIQUITY - y * SIN_OBLIQUITY);
}

/**
 * Rotates a direction from the ecliptic frame back into the equatorial one.
 *
 * The inverse of {@link equatorialToEcliptic}, and present because the star
 * catalogue arrives in equatorial coordinates and the tests want to check the
 * round trip.
 *
 * @param out - The vector to write into.
 * @param ecliptic - The direction in the ecliptic frame.
 * @returns `out`.
 */
export function eclipticToEquatorial(out: Vec3, ecliptic: ReadonlyVec3): Vec3 {
  const { x, y, z } = ecliptic;
  return set(out, x, y * COS_OBLIQUITY - z * SIN_OBLIQUITY, z * COS_OBLIQUITY + y * SIN_OBLIQUITY);
}

/**
 * Builds a unit direction from a right ascension and declination.
 *
 * @param out - The vector to write into.
 * @param rightAscension - Right ascension, in radians.
 * @param declination - Declination, in radians.
 * @returns `out`, a unit vector in the equatorial frame.
 */
export function directionFromEquatorial(
  out: Vec3,
  rightAscension: Radians,
  declination: Radians,
): Vec3 {
  const cosDeclination = Math.cos(declination);
  return set(
    out,
    cosDeclination * Math.cos(rightAscension),
    cosDeclination * Math.sin(rightAscension),
    Math.sin(declination),
  );
}
