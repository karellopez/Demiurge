import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke and visual-regression suites both run against a `vite preview` of the
 * production build, at the real GitHub Pages base path. Running them against the
 * dev server would hide the single most common Pages failure: an absolute asset
 * path that only breaks once the site is served from a subdirectory.
 */
const PORT = 4173;
const BASE_PATH = '/Demiurge/';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  // Serialised on CI so frame-time-sensitive visual comparisons are not
  // perturbed by neighbouring browsers; left to Playwright's default locally.
  ...(process.env['CI'] !== undefined && { workers: 1 }),
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: `http://localhost:${String(PORT)}${BASE_PATH}`,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'smoke',
      testDir: './tests/e2e',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'visual',
      testDir: './tests/visual',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview',
    url: `http://localhost:${String(PORT)}${BASE_PATH}`,
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
  },
});
