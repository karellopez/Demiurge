import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration used only by Stryker.
 *
 * Mutation testing targets `shared/` and `domain/`, whose behaviour is covered
 * entirely by the unit suite. Running the integration project as well would drag
 * a DOM environment into every mutant run for no extra signal, and the
 * allocation tests measure heap growth, which is meaningless under a mutant.
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
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
