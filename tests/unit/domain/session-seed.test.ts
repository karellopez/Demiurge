import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SEED,
  MAX_SEED_LENGTH,
  generateSeedPhrase,
  normalizeSeedText,
  resolveSessionSeed,
} from '@domain/session-seed';
import { createRng } from '@shared/rng';

describe('the default universe', () => {
  it('is the seed every new player lands in, so it is pinned', () => {
    // Changing this silently changes the world that first-time visitors see,
    // and invalidates every screenshot and bug report that did not name a seed.
    expect(DEFAULT_SEED).toBe('first light');
  });

  it('leaves room for a sentence but still fits in a URL', () => {
    expect(MAX_SEED_LENGTH).toBe(64);
  });
});

describe('normalising a typed seed', () => {
  it('lower-cases so a capitalised link still reaches the same universe', () => {
    expect(normalizeSeedText('Kepler 22')).toBe('kepler 22');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeSeedText('  kepler 22  ')).toBe('kepler 22');
  });

  it('collapses interior runs of whitespace', () => {
    expect(normalizeSeedText('kepler    22')).toBe('kepler 22');
  });

  it('falls back to the default seed when nothing usable remains', () => {
    expect(normalizeSeedText(' '.repeat(3))).toBe(DEFAULT_SEED);
    expect(normalizeSeedText('')).toBe(DEFAULT_SEED);
  });

  it('truncates a seed longer than the maximum', () => {
    expect(normalizeSeedText('a'.repeat(200))).toHaveLength(MAX_SEED_LENGTH);
  });

  it('is idempotent', () => {
    const once = normalizeSeedText('  Cobalt   MERIDIAN 417 ');
    expect(normalizeSeedText(once)).toBe(once);
  });
});

describe('generating a seed phrase', () => {
  it('produces a speakable adjective-noun-number phrase', () => {
    expect(generateSeedPhrase(createRng('phrase'))).toMatch(/^[a-z]+ [a-z]+ \d{3}$/u);
  });

  it('is reproducible from the same generator seed', () => {
    expect(generateSeedPhrase(createRng('same'))).toBe(generateSeedPhrase(createRng('same')));
  });

  it('differs between generator seeds', () => {
    const phrases = new Set(
      ['a', 'b', 'c', 'd', 'e', 'f'].map((seed) => generateSeedPhrase(createRng(seed))),
    );
    expect(phrases.size).toBeGreaterThan(1);
  });

  it('survives normalisation unchanged, so a generated seed is already canonical', () => {
    const phrase = generateSeedPhrase(createRng('canonical'));
    expect(normalizeSeedText(phrase)).toBe(phrase);
  });
});

describe('resolving a session seed', () => {
  it('uses the default universe when no seed was requested', () => {
    expect(resolveSessionSeed(undefined).phrase).toBe(DEFAULT_SEED);
  });

  it('canonicalises the requested seed', () => {
    expect(resolveSessionSeed('  Tidal SPIRE 003 ').phrase).toBe('tidal spire 003');
  });

  it('roots a generator that replays identically for the same phrase', () => {
    const first = resolveSessionSeed('cobalt meridian');
    const second = resolveSessionSeed('COBALT   meridian');
    expect(first.rng.nextUint32()).toBe(second.rng.nextUint32());
  });

  it('roots different generators for different phrases', () => {
    expect(resolveSessionSeed('one').rng.nextUint32()).not.toBe(
      resolveSessionSeed('two').rng.nextUint32(),
    );
  });
});

describe('when the generator misbehaves', () => {
  /**
   * A generator that returns an out-of-range index, as a broken or wrongly
   * wired implementation would. The seed phrase must still be a usable phrase
   * rather than the string "undefined undefined".
   */
  const brokenRng = {
    nextUint32: (): number => 0,
    nextFloat: (): number => 0,
    nextRange: (): number => 0,
    nextInt: (): number => 9999,
  };

  it('still produces a well-formed phrase', () => {
    expect(generateSeedPhrase(brokenRng)).toMatch(/^[a-z]+ [a-z]+ \d+$/u);
  });

  it('never emits the word undefined', () => {
    expect(generateSeedPhrase(brokenRng)).not.toContain('undefined');
  });
});
