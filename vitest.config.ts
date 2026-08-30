import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vitest/config';

const alias = {
  '@app': fileURLToPath(new URL('src/app', import.meta.url)),
  '@presentation': fileURLToPath(new URL('src/presentation', import.meta.url)),
  '@features': fileURLToPath(new URL('src/features', import.meta.url)),
  '@domain': fileURLToPath(new URL('src/domain', import.meta.url)),
  '@shared': fileURLToPath(new URL('src/shared', import.meta.url)),
  '@tests': fileURLToPath(new URL('tests', import.meta.url)),
};

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: { name: 'unit', include: ['tests/unit/**/*.test.ts'], environment: 'node' },
      },
      {
        resolve: { alias },
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          // The integration suite exercises the DOM adapters and the composition
          // root, so it needs a document. happy-dom is used rather than jsdom
          // for start-up cost: this project runs the suite on every commit.
          environment: 'happy-dom',
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'bench',
          include: ['tests/bench/**/*.bench.ts'],
          environment: 'node',
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'perf',
          include: ['tests/bench/**/*.test.ts'],
          environment: 'node',
          // The allocation test needs a forced collection to read the heap
          // reliably; without this flag it reports itself as skipped rather
          // than passing on a measurement it could not take.
          execArgv: ['--expose-gc'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'json', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/index.ts',
        'src/**/*.d.ts',
        'src/app/main.ts',
        // These need a real WebGL context, which neither happy-dom nor jsdom
        // provides. They are covered by the Playwright suites, which render on a
        // real GPU; counting them here would only measure how good our stubs are.
        'src/presentation/render/solar-system-scene.ts',
        'src/presentation/render/body-appearance.ts',
        'src/presentation/render/orbit-line.ts',
        'src/presentation/render/space-scene.ts',
        'src/presentation/render/render-target.ts',
      ],
      // Gates mirror docs/quality.md §5.1. `scripts/qa-report.ts` re-checks the
      // per-layer floors for `shared/` and `domain/`, which Vitest thresholds
      // cannot express independently of the overall number.
      thresholds: {
        lines: 80,
        branches: 75,
        functions: 80,
        statements: 80,
      },
    },
  },
});
