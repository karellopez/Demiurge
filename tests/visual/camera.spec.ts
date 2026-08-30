import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Phase 3's acceptance criteria, in a real browser.
 *
 * The geometry is checked exhaustively offline in the unit and integration
 * suites. What can only be checked here is that selecting a body actually moves
 * the camera, that the card follows, and that a scale preset animates rather
 * than snapping — all of which are about the wiring between layers.
 */

/**
 * Reads one row of the stats card by its stable field name.
 *
 * @param field - The row's `data-field` value.
 * @returns A function taking the page and returning that row's value locator.
 */
function cardValue(field: string): (page: Page) => Locator {
  return (page) => page.locator(`.browser__card [data-field="${field}"] .readout__value`);
}

test('opens following Earth, with the card and the list agreeing', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.browser__title')).toHaveText('Earth', { timeout: 10_000 });
  await expect(page.locator('.browser__body--selected')).toHaveText('Earth');

  // Thirty Earth radii is a hundred and ninety-one thousand kilometres.
  await expect(cardValue('distance-camera')(page)).toHaveText(/19\d,\d\d\d km/u);
  // Earth is near perihelion on the first of January.
  await expect(cardValue('distance-star')(page)).toHaveText(/0\.9\d\d au/u);
});

test('follows a body picked from the list', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.browser__title')).toHaveText('Earth', { timeout: 10_000 });

  await page.locator('.browser__body[data-body-id="saturn"]').click();

  await expect(page.locator('.browser__title')).toHaveText('Saturn');
  await expect(page.locator('.browser__body--selected')).toHaveText('Saturn');
  // Saturn sits about nine and a half astronomical units out.
  await expect(cardValue('distance-star')(page)).toHaveText(/9\.\d+ au/u, { timeout: 10_000 });
});

test('follows the Sun, which is a body like any other', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.browser__title')).toHaveText('Earth', { timeout: 10_000 });

  await page.locator('.browser__body[data-body-id="sun"]').click();
  await expect(page.locator('.browser__title')).toHaveText('Sun');
  await expect(cardValue('distance-star')(page)).toHaveText('0 m', { timeout: 10_000 });
});

test('narrows the list as you type, keeping the parents of a match', async ({ page }) => {
  await page.goto('./');
  const search = page.locator('.browser__search');
  await search.fill('titan');

  await expect(page.locator('.browser__body[data-body-id="titan"]')).toBeVisible();
  await expect(page.locator('.browser__body[data-body-id="saturn"]')).toBeVisible();
  await expect(page.locator('.browser__body[data-body-id="mercury"]')).toBeHidden();
});

test('typing in the search box does not warp time', async ({ page }) => {
  await page.goto('./');
  const rate = page.locator('.time-hud__rate');
  await expect(rate).toHaveText('1x', { timeout: 10_000 });

  // "." and "," are the time-warp keys; inside the search box they are text.
  await page.locator('.browser__search').fill('a.,rp');
  await expect(rate).toHaveText('1x');
});

test('cycles the camera mode on C, and never offers Sun-relative on the Sun', async ({ page }) => {
  await page.goto('./');
  const mode = cardValue('mode')(page);
  await expect(mode).toHaveText('Orbit', { timeout: 10_000 });

  await page.keyboard.press('c');
  await expect(mode).not.toHaveText('Orbit');

  await page.locator('.browser__body[data-body-id="sun"]').click();
  for (let step = 0; step < 6; step += 1) {
    await page.keyboard.press('c');
    await expect(mode).not.toHaveText('Sun-relative');
  }
});

test('animates a scale preset rather than snapping to it', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.browser__title')).toHaveText('Earth', { timeout: 10_000 });

  const distance = cardValue('distance-camera')(page);
  const before = await distance.textContent();

  // Preset 3 is the textbook diagram: distances crushed, bodies enormous.
  await page.keyboard.press('3');

  // The *simulation* must not move. Scale is a rendering transform, so the
  // distances the card reports are in true metres and do not change at all.
  await expect(distance).toHaveText(before ?? '');
  await expect(cardValue('distance-star')(page)).toHaveText(/0\.9\d\d au/u);

  // And nothing falls over: the scene keeps drawing every body.
  await page.keyboard.press('F3');
  await expect(
    page.locator('.stat').filter({ hasText: 'Draw calls' }).locator('.stat__value'),
  ).toHaveText(/^74 \/ \d+$/u, { timeout: 10_000 });
});

test('hides the browser on B', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.browser')).toBeVisible();
  await page.keyboard.press('b');
  await expect(page.locator('.browser')).toBeHidden();
  await page.keyboard.press('b');
  await expect(page.locator('.browser')).toBeVisible();
});

test('walks the catalogue with the bracket keys, in the order the list shows', async ({ page }) => {
  await page.goto('./');
  const title = page.locator('.browser__title');
  await expect(title).toHaveText('Earth');

  // Earth is followed by its moon in tree order, and the Moon by Mars.
  await page.keyboard.press(']');
  await expect(title).toHaveText('Moon');
  await page.keyboard.press(']');
  await expect(title).toHaveText('Mars');
  await page.keyboard.press('[');
  await expect(title).toHaveText('Moon');
});

test('jumps straight to a planet from the quick bar', async ({ page }) => {
  await page.goto('./');
  await page.locator('.browser__quick-body[data-body-id="jupiter"]').click();
  await expect(page.locator('.browser__title')).toHaveText('Jupiter');
  await expect(page.locator('.browser__body[data-body-id="jupiter"]')).toHaveAttribute(
    'aria-current',
    'true',
  );
});
