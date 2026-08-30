/**
 * `Result<T, E>` — the project's representation of an *expected* failure.
 *
 * The rule from the coding standards: exceptions signal programmer error and
 * should crash loudly in development; anything the running program can
 * reasonably expect to go wrong (an asset 404, a shader that will not compile, a
 * worker that times out) is a value, not a throw. Making those failures part of
 * the return type means the compiler will not let a caller forget them, which is
 * what keeps the renderer's fallback paths honest.
 *
 * @module
 */

/** A successful outcome carrying a value. */
export interface Ok<out T> {
  readonly ok: true;
  readonly value: T;
}

/** A failed outcome carrying a described error. */
export interface Err<out E> {
  readonly ok: false;
  readonly error: E;
}

/**
 * The outcome of an operation that is allowed to fail.
 *
 * @template T - The value produced on success.
 * @template E - The error produced on failure.
 */
export type Result<T, E> = Ok<T> | Err<E>;

/**
 * Wraps a value as a successful result.
 *
 * @param value - The value to carry.
 * @returns A successful result.
 */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/**
 * Wraps an error as a failed result.
 *
 * @param error - The error to carry.
 * @returns A failed result.
 */
export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

/**
 * Narrows a result to its successful branch.
 *
 * @param result - The result to inspect.
 * @returns True when the result succeeded.
 */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

/**
 * Narrows a result to its failed branch.
 *
 * @param result - The result to inspect.
 * @returns True when the result failed.
 */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

/**
 * Reads a result's value, substituting a fallback when it failed.
 *
 * This is the shape most rendering fallbacks take: try the fetched texture,
 * fall back to the procedural one, carry on without branching at the call site.
 *
 * @param result - The result to read.
 * @param fallback - The value to use when the result failed.
 * @returns The carried value, or the fallback.
 */
export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.ok ? result.value : fallback;
}

/**
 * Applies a function to a successful value, leaving a failure untouched.
 *
 * @param result - The result to transform.
 * @param transform - Applied to the value when the result succeeded.
 * @returns A result carrying the transformed value, or the original error.
 */
export function mapOk<T, U, E>(result: Result<T, E>, transform: (value: T) => U): Result<U, E> {
  return result.ok ? ok(transform(result.value)) : result;
}

/**
 * Replaces a failure's error, leaving a success untouched.
 *
 * Used to add context as an error crosses a layer boundary, so that a worker
 * timeout arrives at the UI as something a person can act on rather than as a
 * bare code. Never swallow the original: fold it into the new error.
 *
 * @param result - The result to transform.
 * @param transform - Applied to the error when the result failed.
 * @returns A result carrying the transformed error, or the original value.
 */
export function mapErr<T, E, F>(result: Result<T, E>, transform: (error: E) => F): Result<T, F> {
  return result.ok ? result : err(transform(result.error));
}
