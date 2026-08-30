import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CameraMode } from '@domain/camera/camera-mode';
import { buildCatalog } from '@features/space/body-catalog';
import type { RawCatalog } from '@features/space/catalog-schema';
import { createSystemState } from '@features/space/propagate-system';
import { mountBodyBrowser, type BodyBrowser } from '@presentation/ui/body-browser';
import { createVec3 } from '@shared/math/vec3';
import { seconds } from '@shared/units';

import rawCatalog from '../../data/bodies.json';

const catalog = buildCatalog(rawCatalog as unknown as RawCatalog);
const system = createSystemState(catalog);
system.update(seconds(0));

let host: HTMLElement;
let browser: BodyBrowser;
let selected: string[];
let currentMs: number;

/**
 * Reads the rows currently on screen.
 *
 * @returns The visible body names, in list order.
 */
function visibleNames(): string[] {
  return [...host.querySelectorAll<HTMLButtonElement>('.browser__body')]
    .filter((button) => !button.hidden)
    .map((button) => button.textContent);
}

/**
 * Refreshes the card, letting enough time pass for the throttle to allow it.
 *
 * @param bodyId - The body to describe.
 * @param mode - The camera mode to show.
 */
function refresh(bodyId: string, mode = CameraMode.Orbit): void {
  currentMs += 1000;
  const body = catalog.byId(bodyId)!;
  browser.refresh({
    body,
    mode,
    bodyPosition: system.readPosition(bodyId, createVec3()),
    starPosition: system.readPosition(catalog.root.id, createVec3()),
    cameraPosition: createVec3(),
    simTimeSeconds: seconds(0),
  });
}

beforeEach(() => {
  document.body.innerHTML = '<main id="app"></main>';
  host = document.querySelector<HTMLElement>('#app')!;
  selected = [];
  currentMs = 0;
  browser = mountBodyBrowser(
    host,
    catalog,
    (bodyId) => {
      selected.push(bodyId);
    },
    () => currentMs,
  );
});

describe('the list', () => {
  it('shows every body in the catalogue', () => {
    expect(visibleNames()).toHaveLength(catalog.all.length);
  });

  it('puts the Sun first and indents what orbits what', () => {
    const rows = [...host.querySelectorAll<HTMLButtonElement>('.browser__body')];
    expect(rows[0]?.textContent).toBe('Sun');
    expect(rows[0]?.dataset['depth']).toBe('0');

    const earth = rows.find((row) => row.textContent === 'Earth');
    const moon = rows.find((row) => row.textContent === 'Moon');
    expect(earth?.dataset['depth']).toBe('1');
    expect(moon?.dataset['depth']).toBe('2');
  });

  it('lists a moon immediately under its planet', () => {
    const names = visibleNames();
    expect(names[names.indexOf('Earth') + 1]).toBe('Moon');
  });

  it('reports a click as a selection', () => {
    host
      .querySelector<HTMLButtonElement>('.browser__body[data-body-id="mars"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(selected).toStrictEqual(['mars']);
  });
});

/**
 * Types into the search box.
 *
 * @param query - What to type.
 */
function search(query: string): void {
  const input = host.querySelector<HTMLInputElement>('.browser__search')!;
  input.value = query;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('searching', () => {
  it('narrows to matching names', () => {
    search('titan');
    expect(visibleNames()).toContain('Titan');
    expect(visibleNames()).not.toContain('Mercury');
  });

  it('is case insensitive', () => {
    search('TITAN');
    expect(visibleNames()).toContain('Titan');
  });

  it('matches on part of a name', () => {
    search('rop');
    expect(visibleNames()).toContain('Europa');
  });

  it('keeps the parents of a match, so a moon is not orphaned in the tree', () => {
    search('titan');
    const names = visibleNames();
    expect(names).toContain('Saturn');
    expect(names).toContain('Sun');
  });

  it('restores the whole list when the box is cleared', () => {
    search('titan');
    search('');
    expect(visibleNames()).toHaveLength(catalog.all.length);
  });

  it('ignores surrounding whitespace', () => {
    search('   mars   ');
    expect(visibleNames()).toContain('Mars');
  });

  it('shows nothing but the empty tree for a query that matches nothing', () => {
    search('vulcan');
    expect(visibleNames()).toStrictEqual([]);
  });
});

describe('marking the followed body', () => {
  it('marks it with more than colour', () => {
    browser.markSelected('mars');
    const mars = host.querySelector<HTMLButtonElement>('.browser__body[data-body-id="mars"]');
    expect(mars?.classList.contains('browser__body--selected')).toBe(true);
    expect(mars?.getAttribute('aria-current')).toBe('true');
  });

  it('marks only one at a time', () => {
    browser.markSelected('mars');
    browser.markSelected('venus');
    expect(host.querySelectorAll('.browser__body--selected')).toHaveLength(1);
  });
});

describe('the stats card', () => {
  it('names the body it is describing', () => {
    refresh('mars');
    expect(host.querySelector('.browser__title')?.textContent).toBe('Mars');
  });

  it('shows the camera mode in words', () => {
    refresh('mars', CameraMode.SunRelative);
    expect(host.querySelector('.browser__card')?.textContent).toContain('Sun-relative');
  });

  it('reports Earth about one astronomical unit from the Sun', () => {
    refresh('earth');
    expect(host.querySelector('.browser__card')?.textContent).toMatch(/0\.9\d\d au/u);
  });

  it('reports the radius and surface gravity', () => {
    refresh('earth');
    const card = host.querySelector('.browser__card')?.textContent ?? '';
    expect(card).toContain('6,378 km');
    expect(card).toContain('1.00g');
  });

  it('reports periods in units a person reads', () => {
    refresh('earth');
    const card = host.querySelector('.browser__card')?.textContent ?? '';
    expect(card).toContain('365.26 days');
    expect(card).toContain('23.93 hours');
  });

  it('spells out retrograde rotation', () => {
    refresh('venus');
    expect(host.querySelector('.browser__card')?.textContent).toContain('retrograde');
  });

  it('leaves the Sun with no orbital period', () => {
    refresh('sun');
    expect(host.querySelector('.browser__card')?.textContent).toContain('—');
  });

  it('throttles, so the card is not rewritten sixty times a second', () => {
    refresh('mars');
    // A second refresh one millisecond later must not be written.
    currentMs += 1;
    browser.refresh({
      body: catalog.byId('venus')!,
      mode: CameraMode.Orbit,
      bodyPosition: createVec3(),
      starPosition: createVec3(),
      cameraPosition: createVec3(),
      simTimeSeconds: seconds(0),
    });
    expect(host.querySelector('.browser__title')?.textContent).toBe('Mars');
  });
});

describe('showing and hiding', () => {
  it('starts visible, because a list nobody can find is not a list', () => {
    expect(browser.isVisible()).toBe(true);
  });

  it('toggles', () => {
    browser.toggle();
    expect(browser.isVisible()).toBe(false);
    browser.toggle();
    expect(browser.isVisible()).toBe(true);
  });

  it('removes itself when disposed', () => {
    browser.dispose();
    expect(host.querySelector('.browser')).toBeNull();
  });
});

describe('the search box does not fight the keyboard shortcuts', () => {
  it('is a real input, so a binding can tell typing from a command', () => {
    const input = host.querySelector('.browser__search');
    expect(input).toBeInstanceOf(HTMLInputElement);
    expect(input?.getAttribute('aria-label')).toBe('Search bodies');
    vi.restoreAllMocks();
  });
});

describe('the quick bar', () => {
  it('offers the star and the planets, and nothing else', () => {
    const labels = [...host.querySelectorAll<HTMLButtonElement>('.browser__quick-body')].map(
      (button) => button.dataset['bodyId'],
    );
    expect(labels).toStrictEqual(
      catalog.all
        .filter((body) => body.kind === 'star' || body.kind === 'planet')
        .map((body) => body.id),
    );
  });

  it('names each button for a screen reader, since two letters are not a name', () => {
    const jupiter = host.querySelector<HTMLButtonElement>(
      ':scope .browser__quick-body[data-body-id="jupiter"]',
    );
    expect(jupiter?.textContent).toBe('Ju');
    expect(jupiter?.getAttribute('aria-label')).toBe('Jupiter');
  });

  it('reports a click as a selection', () => {
    host
      .querySelector<HTMLButtonElement>(':scope .browser__quick-body[data-body-id="saturn"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(selected).toStrictEqual(['saturn']);
  });
});

describe('the mass row', () => {
  it('gives Earth its mass in scientific notation', () => {
    refresh('earth');
    expect(
      host.querySelector(':scope .readout[data-field="mass"] .readout__value')?.textContent,
    ).toBe('5.97 × 10²⁴ kg');
  });

  it('gives the Sun its own, six orders of magnitude larger', () => {
    refresh('sun');
    expect(
      host.querySelector(':scope .readout[data-field="mass"] .readout__value')?.textContent,
    ).toBe('1.99 × 10³⁰ kg');
  });
});

describe('the list and the bracket keys agree', () => {
  it('renders the rows in exactly the catalogue tree order', () => {
    const rendered = [...host.querySelectorAll<HTMLButtonElement>('.browser__body')].map(
      (button) => button.dataset['bodyId'],
    );
    expect(rendered).toStrictEqual(catalog.inTreeOrder.map((body) => body.id));
  });
});
