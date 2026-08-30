import { expect, test } from '@playwright/test';

/**
 * These run against a `vite preview` of the *production* build, served from the
 * real GitHub Pages base path. Running them against the dev server would hide
 * the single most common way a Pages deploy breaks: an absolute asset path that
 * works at `/` and 404s at `/Demiurge/`.
 */

test('boots to a running simulation without console errors', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    consoleErrors.push(error.message);
  });

  const startedAt = Date.now();
  await page.goto('./');

  // The title screen appears first and clears itself once there is a frame
  // behind it, so waiting for the canvas is waiting for a real first frame.
  await expect(page.getByRole('heading', { name: 'DEMIURGE' })).toBeVisible();
  await expect(page.locator('canvas.scene')).toBeVisible();
  await expect(page.locator('.time-hud')).toBeVisible();

  expect(Date.now() - startedAt).toBeLessThan(5000);
  expect(consoleErrors).toStrictEqual([]);
});

test('serves every asset from the project base path', async ({ page }) => {
  const notFound: string[] = [];
  page.on('response', (response) => {
    if (response.status() === 404) {
      notFound.push(response.url());
    }
  });

  await page.goto('./');
  await expect(page.locator('canvas.scene')).toBeVisible();
  expect(notFound).toStrictEqual([]);
});

test('reports the detected quality tier and its reasoning', async ({ page }) => {
  await page.goto('./');

  const panel = page.locator('.boot-screen__panel');
  await expect(panel).toContainText('Quality tier');
  await expect(panel).toContainText('Frame target');
  await expect(panel).toContainText('Draw call budget');

  // The reason must be a sentence a person can act on, not a code.
  await expect(page.locator('.boot-screen__reason')).toContainText(/Selected \w+ from/u);
});

test('generates the universe named in the URL, and keeps its name on screen', async ({ page }) => {
  await page.goto('./#seed=cobalt%20meridian%20417');
  // The seed stays in the persistent bar, not just on the title screen: a
  // universe you cannot name is one you cannot share or file a bug against.
  await expect(page.locator('.time-hud__seed')).toHaveText('cobalt meridian 417', {
    timeout: 10_000,
  });
});

test('falls back to the default universe when no seed is given', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.time-hud__seed')).toHaveText('first light', { timeout: 10_000 });
});
