import { expect, test } from '@playwright/test';

/**
 * These run against a `vite preview` of the *production* build, served from the
 * real GitHub Pages base path. Running them against the dev server would hide
 * the single most common way a Pages deploy breaks: an absolute asset path that
 * works at `/` and 404s at `/Demiurge/`.
 */

test('boots to the title screen without console errors', async ({ page }) => {
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
  await expect(page.getByRole('heading', { name: 'DEMIURGE' })).toBeVisible();

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
  await expect(page.getByRole('heading', { name: 'DEMIURGE' })).toBeVisible();
  expect(notFound).toStrictEqual([]);
});

test('reports the detected quality tier and its reasoning', async ({ page }) => {
  await page.goto('./');

  const panel = page.locator('.boot-screen__panel');
  await expect(panel).toContainText('Quality tier');
  await expect(panel).toContainText('Frame target');
  await expect(panel).toContainText('Draw call budget');

  // The reason must be a sentence a person can act on, not a code.
  await expect(page.locator('.boot-screen__reason')).toContainText(/Selected \w+ from/);
});

test('generates the universe named in the URL', async ({ page }) => {
  await page.goto('./#seed=cobalt%20meridian%20417');
  await expect(page.locator('.boot-screen__panel')).toContainText('cobalt meridian 417');
});

test('falls back to the default universe when no seed is given', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.boot-screen__panel')).toContainText('first light');
});
