/**
 * The session seed: the single number the whole universe is a function of.
 *
 * Everything procedural in the project — terrain, points of interest, flora,
 * fauna — is derived from this one value, so it is treated as a first-class
 * piece of product surface rather than as an implementation detail. It is shown
 * on the title screen, carried in the URL, and reproducible by hand: typing the
 * same phrase on a different machine, in a different session, yields the same
 * worlds down to the individual rock.
 *
 * Seeds are *phrases*, not hexadecimal. A player who wants to tell someone else
 * where to look needs to be able to say it out loud.
 *
 * @module
 */

import { createRng, type Rng } from '@shared/rng';

/**
 * Words a generated seed phrase is assembled from.
 *
 * Deliberately short, unambiguous when spoken, and free of near-homophones, so
 * that a seed read aloud survives the trip.
 */
const SEED_ADJECTIVES = [
  'amber',
  'basalt',
  'cobalt',
  'dim',
  'ember',
  'frozen',
  'gilded',
  'hollow',
  'iron',
  'jade',
  'quiet',
  'russet',
  'silent',
  'tidal',
  'umbral',
  'violet',
] as const;

/** Nouns a generated seed phrase is assembled from. */
const SEED_NOUNS = [
  'anvil',
  'basin',
  'canyon',
  'delta',
  'ember',
  'fathom',
  'gulf',
  'harbor',
  'lantern',
  'meridian',
  'oxbow',
  'pillar',
  'quarry',
  'ridge',
  'spire',
  'vault',
] as const;

/** Longest seed a player may type. Long enough for a sentence, short enough for a URL. */
export const MAX_SEED_LENGTH = 64;

/** The seed used when the player has not chosen one and none is in the URL. */
export const DEFAULT_SEED = 'first light';

/**
 * Normalises a seed the player typed.
 *
 * Case and surrounding whitespace are not meaningful — `"Kepler 22"` and
 * `"  kepler   22 "` must name the same universe, or a shared link stops working
 * the moment someone's phone capitalises it. Interior runs of whitespace collapse
 * to a single space for the same reason.
 *
 * @param raw - The seed exactly as typed or as read from the URL.
 * @returns The canonical form, or the default seed when nothing usable remains.
 */
export function normalizeSeedText(raw: string): string {
  const collapsed = raw.trim().toLowerCase().replaceAll(/\s+/gu, ' ');
  if (collapsed === '') {
    return DEFAULT_SEED;
  }
  return collapsed.slice(0, MAX_SEED_LENGTH);
}

/**
 * Generates a speakable seed phrase.
 *
 * @param rng - The generator to draw from. Pass a seeded one to make this reproducible.
 * @returns A phrase such as `"cobalt meridian 417"`.
 */
export function generateSeedPhrase(rng: Rng): string {
  const adjective = SEED_ADJECTIVES[rng.nextInt(0, SEED_ADJECTIVES.length)] ?? 'amber';
  const noun = SEED_NOUNS[rng.nextInt(0, SEED_NOUNS.length)] ?? 'basin';
  const number = rng.nextInt(100, 1000);
  return `${adjective} ${noun} ${String(number)}`;
}

/** A resolved session: the seed, and the generator rooted at it. */
export interface SessionSeed {
  /** The canonical seed phrase, as it should be displayed and shared. */
  readonly phrase: string;
  /** The root generator. Fork it per subsystem rather than drawing from it directly. */
  readonly rng: Rng;
}

/**
 * Resolves the seed for a session.
 *
 * @param requestedSeed - A seed from the URL or the title screen, if there was one.
 * @returns The canonical seed phrase and its root generator.
 */
export function resolveSessionSeed(requestedSeed: string | undefined): SessionSeed {
  const phrase = normalizeSeedText(requestedSeed ?? DEFAULT_SEED);
  return { phrase, rng: createRng(phrase) };
}
