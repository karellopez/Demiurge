import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Phase 2's acceptance surface, in a real browser.
 *
 * The numeric accuracy claim is checked offline against JPL fixtures in
 * `tests/integration/horizons-accuracy.test.ts`. What can only be checked here
 * is that the whole system actually reaches the screen: every body drawn, the
 * simulated date advancing, and the time warp responding in both directions.
 */

/**
 * Reads one row of the F3 overlay.
 *
 * @param label - The row's label text.
 * @returns A function taking the page and returning that row's value locator.
 */
function statValue(label: string): (page: Page) => Locator {
  return (page) => page.locator('.stat').filter({ hasText: label }).locator('.stat__value');
}

test('draws every body in the catalogue', async ({ page }) => {
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

  // Twenty-five bodies: a sphere and a glare each, plus an orbit line for all
  // but the Sun. A body silently lost to a bad transform shows up here as a
  // smaller number, which is the failure a screenshot would not catch.
  await expect(statValue('Draw calls')(page)).toHaveText(/^74 \/ \d+$/u, { timeout: 10_000 });

  expect(consoleErrors).toStrictEqual([]);
});

test('runs the simulation behind the title screen, and clears it on a keypress', async ({
  page,
}) => {
  await page.goto('./');

  // The title screen is a curtain, not a loading gate: the date behind it is
  // already advancing before anyone presses anything.
  await expect(page.locator('.boot-screen')).toBeVisible();
  await expect(page.locator('.boot-screen__prompt')).toContainText('Press any key');
  await expect(page.locator('.time-hud__date')).toHaveText(/UTC$/u, { timeout: 10_000 });

  await page.keyboard.press('Space');
  await expect(page.locator('.boot-screen')).toBeHidden();
  await expect(page.locator('canvas.scene')).toBeVisible();
});

test('shows the simulated date, starting at the epoch', async ({ page }) => {
  await page.goto('./');
  const date = page.locator('.time-hud__date');
  // The epoch is 2000-01-01 12:00 TT, and a session starts there.
  await expect(date).toHaveText(/^2000-01-01 12:00:\d\d UTC$/u, { timeout: 10_000 });
});

test('runs time forwards, backwards, and not at all', async ({ page }) => {
  await page.goto('./');
  const date = page.locator('.time-hud__date');
  const rate = page.locator('.time-hud__rate');

  await expect(rate).toHaveText('1x', { timeout: 10_000 });

  // Wind up to a day a second so the date moves visibly.
  for (let step = 0; step < 3; step += 1) {
    await page.keyboard.press('.');
  }
  await expect(rate).toHaveText('1 day/s');

  const started = await date.textContent();
  await expect.poll(async () => date.textContent(), { timeout: 10_000 }).not.toBe(started);
  const advanced = await date.textContent();

  // Backwards. The propagator is a closed-form function of time, so reversing
  // costs nothing and loses nothing - which is how an eclipse date gets checked.
  await page.keyboard.press('r');
  await expect(rate).toHaveText('-1 day/s');
  await expect.poll(async () => date.textContent(), { timeout: 10_000 }).not.toBe(advanced);

  // Paused, which must read as paused rather than merely slow.
  await page.keyboard.press('p');
  await expect(rate).toHaveText('paused');
  const held = await date.textContent();
  await expect.poll(async () => date.textContent(), { timeout: 2000 }).toBe(held);

  // And back to where the ladder was, rather than to 1x.
  await page.keyboard.press('p');
  await expect(rate).toHaveText('-1 day/s');
});

test('never runs more substeps than the documented cap', async ({ page }) => {
  await page.goto('./');
  await page.keyboard.press('F3');

  // Note what is *not* asserted here. An earlier version of this test demanded
  // that no simulated time ever be abandoned, which is not something the design
  // promises: when the machine is starved - six software-rendered browsers on
  // one CPU, say - the spiral-of-death guard dropping time is the guard working
  // correctly. What is promised is that the guard never runs away, so that is
  // what is checked.
  const steps = statValue('Steps')(page);
  await expect(steps).toHaveText(/^[0-5] \//u, { timeout: 10_000 });

  // And that the simulation keeps moving regardless.
  const date = page.locator('.time-hud__date');
  const started = await date.textContent();
  await expect.poll(async () => date.textContent(), { timeout: 10_000 }).not.toBe(started);
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
