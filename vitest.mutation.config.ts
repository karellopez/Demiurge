import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration used only by Stryker.
 *
 * Mutation testing targets `shared/` and `domain/`. Most of that behaviour is
 * covered by the unit suite, but not all of it: the strongest test of the
 * orbital propagator is the accuracy comparison against JPL Horizons, and the
 * strongest test of the catalogue loader is the one that reads the real
 * catalogue. Both are filed as integration tests because they cross several
 * modules, but neither needs a DOM, so both are included here.
 *
 * Leaving them out was not a neutral choice: without them every arithmetic
 * mutant in the rotation from the orbital plane into the ecliptic survived,
 * because nothing else in the unit suite pins that matrix down. The same is
 * true of the camera rig and the body facts: both are filed as integration
 * tests because they run against the real catalogue, and both are the only
 * thing standing between a mutated camera transition and a green run.
 *
 * The DOM-dependent integration tests and the allocation tests stay out. The
 * first would drag a DOM into every mutant run for no extra signal; the second
 * measures heap growth, which is meaningless under a mutant.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@app': fileURLToPath(new URL('src/app', import.meta.url)),
      '@presentation': fileURLToPath(new URL('src/presentation', import.meta.url)),
      '@features': fileURLToPath(new URL('src/features', import.meta.url)),
      '@domain': fileURLToPath(new URL('src/domain', import.meta.url)),
      '@shared': fileURLToPath(new URL('src/shared', import.meta.url)),
      '@tests': fileURLToPath(new URL('tests', import.meta.url)),
    },
  },
  test: {
    include: [
      'tests/unit/**/*.test.ts',
      'tests/integration/horizons-accuracy.test.ts',
      'tests/integration/body-catalog.test.ts',
      'tests/integration/body-facts.test.ts',
      'tests/integration/camera-rig.test.ts',
      'tests/integration/rotation.test.ts',
    ],
    environment: 'node',
  },
});
