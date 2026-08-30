/**
 * Adapter: the list of bodies, and the quick bar above it.
 *
 * The list is **indented by parent** and shown in `catalog.inTreeOrder`, so Io
 * reads as a moon of Jupiter rather than as an entry in an alphabetical soup,
 * and `[` and `]` walk exactly the rows you can see. The tree is the
 * information, and a
 * search that returned Io alone — indented under nothing — would throw that
 * information away, which is why filtering keeps a match's ancestors.
 *
 * Above it sits a quick bar: the Sun and the planets, one click each. The full
 * tree is twenty-five rows deep and most of those rows are moons, so without it
 * the common case — "show me Jupiter" — costs a scroll or a search.
 *
 * @module
 */

import type { Body, BodyCatalog } from '@domain/body';

/** Pixels of indent per level of the orbital hierarchy. */
const INDENT_STEP_PX = 14;

/** Pixels of padding on a top-level row. */
const INDENT_BASE_PX = 8;

/**
 * Builds the searchable list of bodies, indented by what orbits what.
 *
 * @param catalog - The bodies to list.
 * @param onSelect - Called with a body id when a row is clicked.
 * @returns The list element and its per-body buttons.
 */
export function buildList(
  catalog: BodyCatalog,
  onSelect: (bodyId: string) => void,
): { list: HTMLElement; buttons: Map<string, HTMLButtonElement> } {
  const list = document.createElement('div');
  list.className = 'browser__list';
  const buttons = new Map<string, HTMLButtonElement>();

  const addBody = (body: Body, depth: number): void => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'browser__body';
    button.dataset['bodyId'] = body.id;
    button.dataset['depth'] = String(depth);
    button.style.paddingLeft = `${String(depth * INDENT_STEP_PX + INDENT_BASE_PX)}px`;
    button.textContent = body.name;
    button.addEventListener('click', () => {
      onSelect(body.id);
    });

    list.append(button);
    buttons.set(body.id, button);

    for (const child of catalog.childrenOf(body.id)) {
      addBody(child, depth + 1);
    }
  };

  // The same depth-first walk the catalogue's `inTreeOrder` performs, carrying
  // the depth so each row can be indented by it.
  addBody(catalog.root, 0);
  return { list, buttons };
}

/**
 * Builds the quick bar: the star and the planets, one button each.
 *
 * @param catalog - The bodies to choose from.
 * @param onSelect - Called with a body id when a button is clicked.
 * @returns The bar element.
 */
export function buildQuickBar(
  catalog: BodyCatalog,
  onSelect: (bodyId: string) => void,
): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'browser__quick';

  for (const body of catalog.all) {
    if (body.kind !== 'star' && body.kind !== 'planet') {
      continue;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'browser__quick-body';
    button.dataset['bodyId'] = body.id;
    // The full name would not fit twelve buttons across a panel, and the first
    // two letters are unambiguous for every planet.
    button.textContent = body.name.slice(0, 2);
    button.title = body.name;
    button.setAttribute('aria-label', body.name);
    button.addEventListener('click', () => {
      onSelect(body.id);
    });
    bar.append(button);
  }

  return bar;
}

/**
 * Filters the list to rows whose name contains the query.
 *
 * @param catalog - The catalogue, for walking to ancestors.
 * @param buttons - The rows to filter.
 * @param query - What the player typed.
 */
export function applyFilter(
  catalog: BodyCatalog,
  buttons: ReadonlyMap<string, HTMLButtonElement>,
  query: string,
): void {
  const needle = query.trim().toLowerCase();

  if (needle === '') {
    for (const button of buttons.values()) {
      button.hidden = false;
    }
    return;
  }

  const keep = new Set<string>();
  for (const body of catalog.all) {
    if (!body.name.toLowerCase().includes(needle)) {
      continue;
    }
    keep.add(body.id);
    for (const ancestor of catalog.ancestorsOf(body.id)) {
      keep.add(ancestor.id);
    }
  }

  for (const [bodyId, button] of buttons) {
    button.hidden = !keep.has(bodyId);
  }
}
