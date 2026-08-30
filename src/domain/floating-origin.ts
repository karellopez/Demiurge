/**
 * The floating origin: how a solar system fits inside 32-bit floats.
 *
 * Neptune sits about 4.5e12 m from the Sun. A surface rock is about 1 m across.
 * An f32 carries roughly seven significant digits, so a naive pipeline that
 * hands world coordinates to the GPU has a quantisation step of about 300 km out
 * there — the planet does not merely jitter, it snaps between positions several
 * cities wide.
 *
 * The fix is to move the origin instead of the world. Each frame the camera's
 * f64 position becomes the render origin, and everything is drawn at
 * `f32(worldPos - cameraPos)`. The camera is then always at (0, 0, 0) in render
 * space, and the numbers the GPU sees are small — a rock 3 m away is `3.0`, not
 * `4500000000003.0`. f32's precision is relative, so small numbers are precise
 * numbers.
 *
 * The one rule that matters: **subtract in f64, cast afterwards.** Subtracting
 * two f32s that are each already wrong by 300 km does not recover the metre.
 * That ordering is the whole technique, and it is what the tests here pin down.
 *
 * @module
 */

import { type ReadonlyVec3, subtract, type Vec3 } from '@shared/math/vec3';
import { type Meters } from '@shared/units';

/**
 * Converts a world position to render space, in f64.
 *
 * @param out - The vector to write into. May alias either input.
 * @param worldPositionMeters - The body's position in heliocentric metres.
 * @param originMeters - The render origin, which is the camera's f64 position.
 * @returns `out`, holding the offset from the origin, still in f64.
 */
export function toRenderSpace(
  out: Vec3,
  worldPositionMeters: ReadonlyVec3,
  originMeters: ReadonlyVec3,
): Vec3 {
  return subtract(out, worldPositionMeters, originMeters);
}

/**
 * Converts a world position to render space and quantises it to f32.
 *
 * This is the step that actually reaches a vertex buffer, so it is the step
 * where precision is finally spent. Doing the subtraction first is what leaves
 * anything to spend.
 *
 * @param out - The vector to write into. May alias either input.
 * @param worldPositionMeters - The body's position in heliocentric metres.
 * @param originMeters - The render origin, which is the camera's f64 position.
 * @returns `out`, holding the f32-representable offset from the origin.
 */
export function toRenderSpaceFloat32(
  out: Vec3,
  worldPositionMeters: ReadonlyVec3,
  originMeters: ReadonlyVec3,
): Vec3 {
  subtract(out, worldPositionMeters, originMeters);
  out.x = Math.fround(out.x);
  out.y = Math.fround(out.y);
  out.z = Math.fround(out.z);
  return out;
}

/**
 * Converts a render-space offset back to a world position.
 *
 * Used for picking, for collision queries raised from render space, and for the
 * round-trip test that guards the whole scheme.
 *
 * @param out - The vector to write into. May alias either input.
 * @param renderPositionMeters - An offset from the render origin.
 * @param originMeters - The render origin the offset was taken against.
 * @returns `out`, holding the heliocentric position.
 */
export function toWorldSpace(
  out: Vec3,
  renderPositionMeters: ReadonlyVec3,
  originMeters: ReadonlyVec3,
): Vec3 {
  out.x = renderPositionMeters.x + originMeters.x;
  out.y = renderPositionMeters.y + originMeters.y;
  out.z = renderPositionMeters.z + originMeters.z;
  return out;
}

/**
 * The worst-case spacing between representable f32 values near a magnitude.
 *
 * This is what "f32 is not enough" means numerically, and it is worth being able
 * to state rather than assert: at 1 au the spacing is about 16 km, and at
 * Neptune's distance about 500 km. Anything smaller than the returned value
 * simply cannot be expressed at that distance from the origin.
 *
 * @param magnitudeMeters - Distance from the origin.
 * @returns The gap to the next representable f32, in metres.
 */
export function float32ResolutionAt(magnitudeMeters: number): Meters {
  const magnitude = Math.abs(magnitudeMeters);
  if (magnitude === 0) {
    return Number.MIN_VALUE as Meters;
  }
  // f32 carries a 24-bit significand, so consecutive values near 2^e are
  // 2^(e-23) apart.
  const exponent = Math.floor(Math.log2(magnitude));
  return (2 ** (exponent - 23)) as Meters;
}

/**
 * Reports whether a body is close enough to the origin to be drawn as geometry.
 *
 * Beyond this the body is sub-pixel anyway and is drawn as a physically
 * motivated glare impostor instead, which is both cheaper and closer to what the
 * eye actually sees. The threshold is expressed in terms of the detail that must
 * survive: if f32 cannot represent a feature that size at that distance, real
 * geometry there would only shimmer.
 *
 * @param distanceToOriginMeters - How far the body is from the render origin.
 * @param requiredDetailMeters - The smallest feature that must stay stable.
 * @returns True when f32 can hold the required detail at that distance.
 */
export function canRenderAsGeometry(
  distanceToOriginMeters: number,
  requiredDetailMeters: number,
): boolean {
  return float32ResolutionAt(distanceToOriginMeters) <= requiredDetailMeters;
}
