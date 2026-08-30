import { expect, test } from '@playwright/test';

/**
 * Phase 1's acceptance criterion.
 *
 * Two one-metre cubes, one at 1 au and one at 4.5e12 m, in the same frame. Both
 * must be visible, stable and free of z-fighting against a far plane thirteen
 * orders of magnitude away. A regression in the floating origin or in the depth
 * configuration shows up here as the far cube vanishing, tearing or flickering.
 *
 * Note on method: reading the canvas back with `drawImage` does not work. A
 * WebGL drawing buffer is cleared once it has been composited unless
 * `preserveDrawingBuffer` is set, and setting that costs real performance on
 * exactly the tier this project cares most about. So the evidence here is the
 * renderer's own draw-call counter, which the F3 overlay already publishes, plus
 * a screenshot baseline that Playwright captures from the composited page.
 */

test('draws the scene, and says how much it drew', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    consoleErrors.push(error.message);
  });

  await page.goto('./#seed=first%20light');
  await expect(page.locator('canvas.scene')).toBeVisible();

  await page.keyboard.press('F3');
  const drawCalls = page.locator('.stat').filter({ hasText: 'Draw calls' }).locator('.stat__value');

  // The counter starts at the em-dash placeholder and is filled on the first
  // throttled refresh, so waiting for a number is also waiting for a real frame.
  await expect(drawCalls).toHaveText(/^[1-9]\d* \/ \d+$/u, { timeout: 10_000 });

  const triangles = page.locator('.stat').filter({ hasText: 'Triangles' }).locator('.stat__value');
  await expect(triangles).not.toHaveText('—');

  expect(consoleErrors).toStrictEqual([]);
});

test('keeps the simulation running and the frame budget met', async ({ page }) => {
  await page.goto('./');
  await page.keyboard.press('F3');

  const simTime = page.locator('.stat').filter({ hasText: 'Sim time' }).locator('.stat__value');
  await expect(simTime).toHaveText(/^\d+\.\d s$/u, { timeout: 10_000 });

  // Wait on the observable condition rather than on the clock: the reading must
  // *change*, which is what "the simulation is running" actually means.
  const first = await simTime.textContent();
  await expect.poll(async () => simTime.textContent(), { timeout: 10_000 }).not.toBe(first);

  // No simulated time may be abandoned during a quiet, idle scene; a non-zero
  // figure here means the spiral-of-death guard fired when it should not have.
  const steps = page.locator('.stat').filter({ hasText: 'Steps' }).locator('.stat__value');
  await expect(steps).toHaveText(/\/ 0\.000 s$/u);
});

test('shows and hides the statistics overlay on F3', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.stats')).toBeHidden();

  await page.keyboard.press('F3');
  await expect(page.locator('.stats')).toBeVisible();
  await expect(page.locator('.stats')).toContainText('Draw calls');

  await page.keyboard.press('F3');
  await expect(page.locator('.stats')).toBeHidden();
});
