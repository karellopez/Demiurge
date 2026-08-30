/**
 * The session in the URL.
 *
 * A configuration being a shareable link is a product requirement, not a
 * convenience: the seed determines the whole universe, so a link that carries it
 * is the difference between "look at this canyon" and "trust me, it was good".
 *
 * @module
 */

/**
 * Reads the session seed out of a URL hash such as `#seed=cobalt%20meridian`.
 *
 * @param hash - The `location.hash` value, with or without its leading `#`.
 * @returns The requested seed, or `undefined` when the hash carries none.
 */
export function readSeedFromHash(hash: string): string | undefined {
  const parameters = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  return parameters.get('seed') ?? undefined;
}
