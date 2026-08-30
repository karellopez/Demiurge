/**
 * Adapter: the body browser.
 *
 * Assembles the search box, the quick bar and the list from
 * {@link ./body-list}, puts the stats card from {@link ./body-card} underneath
 * them, and hands back the handle the composition root drives.
 *
 * @module
 */

import type { BodyCatalog } from '@domain/body';

import { buildCard, writeCard, type CardCells, type CardUpdate } from './body-card';
import { applyFilter, buildList, buildQuickBar } from './body-list';

/** Milliseconds between card updates. Ten a second stays readable. */
const REFRESH_INTERVAL_MS = 100;

/** The browser and card, mounted. */
export interface BodyBrowser {
  /**
   * Redraws the card. Throttled internally, so it is safe to call every frame.
   *
   * @param update - The body, the mode, and the three positions.
   */
  refresh(update: CardUpdate): void;
  /**
   * Marks a body as the followed one in the list.
   *
   * @param bodyId - The body now being followed.
   */
  markSelected(bodyId: string): void;
  /** Shows or hides the browser, as `B` does. */
  toggle(): void;
  /** Whether the browser is currently visible. */
  isVisible(): boolean;
  /** Removes the browser from the document. */
  dispose(): void;
}

/**
 * Builds the whole panel: search box, list and card.
 *
 * @param host - The element to mount into.
 * @param catalog - The bodies to list.
 * @param onSelect - Called with a body id when a row is clicked.
 * @returns The panel, its row buttons, and the card's cells.
 */
function buildPanel(
  host: HTMLElement,
  catalog: BodyCatalog,
  onSelect: (bodyId: string) => void,
): { panel: HTMLElement; buttons: Map<string, HTMLButtonElement>; cells: CardCells } {
  const panel = document.createElement('aside');
  panel.className = 'browser';

  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'browser__search';
  search.placeholder = 'Search bodies';
  search.setAttribute('aria-label', 'Search bodies');

  const { list, buttons } = buildList(catalog, onSelect);
  search.addEventListener('input', () => {
    applyFilter(catalog, buttons, search.value);
  });

  panel.append(search, buildQuickBar(catalog, onSelect), list);
  const cells = buildCard(panel, catalog.root.name);
  host.append(panel);

  return { panel, buttons, cells };
}

/**
 * Mounts the body browser and the stats card.
 *
 * @param host - The element to mount into.
 * @param catalog - The bodies to list.
 * @param onSelect - Called with a body id when the player picks one.
 * @param nowMs - Reads wall-clock milliseconds, so a test controls the throttle.
 * @returns The mounted browser.
 */
export function mountBodyBrowser(
  host: HTMLElement,
  catalog: BodyCatalog,
  onSelect: (bodyId: string) => void,
  nowMs: () => number,
): BodyBrowser {
  const { panel, buttons, cells } = buildPanel(host, catalog, onSelect);

  let lastRefreshMs = -Infinity;

  return {
    refresh(update: CardUpdate): void {
      const now = nowMs();
      if (now - lastRefreshMs < REFRESH_INTERVAL_MS) {
        return;
      }
      lastRefreshMs = now;
      writeCard(cells, update);
    },

    markSelected(bodyId: string): void {
      for (const [id, button] of buttons) {
        const isSelected = id === bodyId;
        button.classList.toggle('browser__body--selected', isSelected);
        // Selection is state, and colour alone must never carry it.
        button.setAttribute('aria-current', isSelected ? 'true' : 'false');
      }
    },

    toggle(): void {
      panel.hidden = !panel.hidden;
    },

    isVisible(): boolean {
      return !panel.hidden;
    },

    dispose(): void {
      panel.remove();
    },
  };
}
