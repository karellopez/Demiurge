import { expect, test } from '@playwright/test';

/**
 * Visual regression baselines.
 *
 * Every shot is taken at a fixed seed, a fixed viewport and with animation
 * disabled, so a diff means a rendering change rather than a timing accident.
 * As the renderer lands, this suite grows the shots the brief calls for: Saturn
 * with rings, an eclipse, a Mars sunset, a lunar surface at one metre, and the
 * explosion at frame 60.
 */

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('title screen', async ({ page }) => {
  await page.goto('./#seed=first%20light');
  await expect(page.getByRole('heading', { name: 'DEMIURGE' })).toBeVisible();

  // The renderer string is hardware-specific, so it is masked before the shot;
  // everything else on the screen is deterministic.
  await page.evaluate(() => {
    const rows = document.querySelectorAll('.readout');
    const renderer = [...rows].find((row) => row.textContent.includes('Renderer'));
    const value = renderer?.querySelector('.readout__value');
    if (value) {
      value.textContent = 'masked for visual regression';
    }
    const reason = document.querySelector('.boot-screen__reason');
    if (reason) {
      reason.textContent = 'masked for visual regression';
    }
  });

  await expect(page).toHaveScreenshot('title-screen.png', { maxDiffPixelRatio: 0.01 });
});
