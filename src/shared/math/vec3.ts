/**
 * Double-precision 3-vectors, written for a frame loop that must not allocate.
 *
 * Every operation takes an `out` vector and writes into it. That is the
 * gl-matrix convention and it looks clumsy at the call site, which is the price
 * of never producing garbage: a `new Vector3()` per body per frame is a GC pause
 * during descent, and a GC pause is the one thing the Potato tier cannot absorb.
 *
 * These are f64 throughout, because they hold simulation positions in metres and
 * Neptune sits about 4.5e12 m out. Conversion to f32 happens once, at the
 * floating-origin boundary, and never before.
 *
 * @module
 */

/** A mutable double-precision 3-vector. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** A vector that will not be written to. */
export type ReadonlyVec3 = Readonly<Vec3>;

/**
 * Allocates a vector.
 *
 * Call this during set-up, never inside the frame loop. The frame loop reuses
 * scratch vectors created here.
 *
 * @param x - Initial x component.
 * @param y - Initial y component.
 * @param z - Initial z component.
 * @returns A new vector.
 */
export function createVec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

/**
 * Sets a vector's components.
 *
 * @param out - The vector to write into.
 * @param x - New x component.
 * @param y - New y component.
 * @param z - New z component.
 * @returns `out`, for chaining.
 */
export function set(out: Vec3, x: number, y: number, z: number): Vec3 {
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

/**
 * Copies one vector into another.
 *
 * @param out - The vector to write into.
 * @param source - The vector to copy.
 * @returns `out`, for chaining.
 */
export function copy(out: Vec3, source: ReadonlyVec3): Vec3 {
  out.x = source.x;
  out.y = source.y;
  out.z = source.z;
  return out;
}

/**
 * Adds two vectors.
 *
 * @param out - The vector to write into. May alias either input.
 * @param a - Left operand.
 * @param b - Right operand.
 * @returns `out`, for chaining.
 */
export function add(out: Vec3, a: ReadonlyVec3, b: ReadonlyVec3): Vec3 {
  out.x = a.x + b.x;
  out.y = a.y + b.y;
  out.z = a.z + b.z;
  return out;
}

/**
 * Subtracts one vector from another.
 *
 * This is the operation the whole precision strategy rests on: it must happen in
 * f64, before anything is cast to f32. Subtracting in f32 at solar-system
 * distances loses hundreds of kilometres.
 *
 * @param out - The vector to write into. May alias either input.
 * @param a - The vector subtracted from.
 * @param b - The vector to subtract.
 * @returns `out`, for chaining.
 */
export function subtract(out: Vec3, a: ReadonlyVec3, b: ReadonlyVec3): Vec3 {
  out.x = a.x - b.x;
  out.y = a.y - b.y;
  out.z = a.z - b.z;
  return out;
}

/**
 * Scales a vector.
 *
 * @param out - The vector to write into. May alias the input.
 * @param a - The vector to scale.
 * @param factor - The scalar.
 * @returns `out`, for chaining.
 */
export function scale(out: Vec3, a: ReadonlyVec3, factor: number): Vec3 {
  out.x = a.x * factor;
  out.y = a.y * factor;
  out.z = a.z * factor;
  return out;
}

/**
 * Adds a scaled vector to another. The fused form saves a scratch vector.
 *
 * @param out - The vector to write into. May alias either input.
 * @param a - The base vector.
 * @param b - The vector to scale and add.
 * @param factor - The scalar applied to `b`.
 * @returns `out`, for chaining.
 */
export function addScaled(out: Vec3, a: ReadonlyVec3, b: ReadonlyVec3, factor: number): Vec3 {
  out.x = a.x + b.x * factor;
  out.y = a.y + b.y * factor;
  out.z = a.z + b.z * factor;
  return out;
}

/**
 * Computes the dot product.
 *
 * @param a - Left operand.
 * @param b - Right operand.
 * @returns The dot product.
 */
export function dot(a: ReadonlyVec3, b: ReadonlyVec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/**
 * Computes the cross product.
 *
 * @param out - The vector to write into. May alias either input.
 * @param a - Left operand.
 * @param b - Right operand.
 * @returns `out`, for chaining.
 */
export function cross(out: Vec3, a: ReadonlyVec3, b: ReadonlyVec3): Vec3 {
  // Read every component before writing, so `out` may alias `a` or `b`.
  const x = a.y * b.z - a.z * b.y;
  const y = a.z * b.x - a.x * b.z;
  const z = a.x * b.y - a.y * b.x;
  return set(out, x, y, z);
}

/**
 * Computes the squared length.
 *
 * Prefer this to {@link length} wherever the comparison allows it; it avoids a
 * square root, and at solar-system magnitudes it also avoids an overflow that
 * the naive `sqrt(x*x + y*y + z*z)` would hit.
 *
 * @param a - The vector to measure.
 * @returns The squared length.
 */
export function lengthSquared(a: ReadonlyVec3): number {
  return a.x * a.x + a.y * a.y + a.z * a.z;
}

/**
 * Computes the length.
 *
 * Uses `Math.hypot`, which is slower than the naive form but does not overflow
 * on the magnitudes this project deals in: squaring 4.5e12 is fine in f64, but
 * the same code reused at other scales is a trap worth closing here.
 *
 * @param a - The vector to measure.
 * @returns The length.
 */
export function length(a: ReadonlyVec3): number {
  return Math.hypot(a.x, a.y, a.z);
}

/**
 * Computes the distance between two points.
 *
 * @param a - First point.
 * @param b - Second point.
 * @returns The distance.
 */
export function distance(a: ReadonlyVec3, b: ReadonlyVec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/**
 * Normalises a vector to unit length.
 *
 * A zero-length vector is left as zero rather than becoming `NaN`. Returning
 * `NaN` here would propagate silently into a camera basis and take several
 * frames to become visible as a black screen.
 *
 * @param out - The vector to write into. May alias the input.
 * @param a - The vector to normalise.
 * @returns `out`, for chaining.
 */
export function normalize(out: Vec3, a: ReadonlyVec3): Vec3 {
  const magnitude = length(a);
  if (magnitude === 0) {
    return set(out, 0, 0, 0);
  }
  return scale(out, a, 1 / magnitude);
}

/**
 * Linearly interpolates between two vectors.
 *
 * @param out - The vector to write into. May alias either input.
 * @param a - The value at `t = 0`.
 * @param b - The value at `t = 1`.
 * @param t - The interpolation parameter. Not clamped.
 * @returns `out`, for chaining.
 */
export function lerp(out: Vec3, a: ReadonlyVec3, b: ReadonlyVec3, t: number): Vec3 {
  out.x = a.x + (b.x - a.x) * t;
  out.y = a.y + (b.y - a.y) * t;
  out.z = a.z + (b.z - a.z) * t;
  return out;
}

/**
 * Reports whether two vectors are equal within a tolerance.
 *
 * @param a - Left operand.
 * @param b - Right operand.
 * @param toleranceMeters - Largest component-wise difference still considered equal.
 * @returns True when every component agrees within the tolerance.
 */
export function isApproximately(
  a: ReadonlyVec3,
  b: ReadonlyVec3,
  toleranceMeters: number,
): boolean {
  return (
    Math.abs(a.x - b.x) <= toleranceMeters &&
    Math.abs(a.y - b.y) <= toleranceMeters &&
    Math.abs(a.z - b.z) <= toleranceMeters
  );
}
