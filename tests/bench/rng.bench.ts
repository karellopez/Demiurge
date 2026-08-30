import { bench, describe } from 'vitest';

import { createRng, forkRng, hashSeedText } from '@shared/rng';
import { summariseFrameTimes } from '@shared/statistics';

describe('seeded generation', () => {
  const rng = createRng('benchmark');

  bench('nextFloat', () => {
    rng.nextFloat();
  });

  bench('nextUint32', () => {
    rng.nextUint32();
  });

  // Forking is on the terrain streaming path: one fork per patch, thousands of
  // patches during a descent, so its cost is a real budget line.
  bench('forkRng', () => {
    forkRng('benchmark', 'mars/patch/7/2481');
  });

  bench('hashSeedText', () => {
    hashSeedText('cobalt meridian 417');
  });
});

describe('frame-time statistics', () => {
  const window = Array.from({ length: 120 }, (_, index) => 8 + (index % 12));

  bench('summariseFrameTimes over a 120-frame window', () => {
    summariseFrameTimes(window);
  });
});
