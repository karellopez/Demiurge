/**
 * Adapter: the stats card under the body list.
 *
 * Live facts about whichever body the camera is following. The formatting is
 * kept separate from the DOM write — {@link cardText} is pure and takes no
 * elements — so the wording and the units can be tested without a document, and
 * so the write itself stays a loop over a map of cells that never reallocates.
 *
 * Numbers are set in tabular numerals by the stylesheet, because a distance that
 * counts down while the digits change width is unreadable.
 *
 * @module
 */

import type { Body } from '@domain/body';
import {
  computeBodyFacts,
  formatDistance,
  formatMass,
  formatPeriod,
  formatRadius,
  formatSurfaceGravity,
} from '@domain/body-facts';
import { CAMERA_MODE_LABELS, type CameraMode } from '@domain/camera/camera-mode';
import type { ReadonlyVec3 } from '@shared/math/vec3';

/** What the card needs to redraw itself. */
export interface CardUpdate {
  /** The body being followed. */
  readonly body: Body;
  /** The active camera mode. */
  readonly mode: CameraMode;
  /** The body's position, in true heliocentric metres. */
  readonly bodyPosition: ReadonlyVec3;
  /** The star's position. */
  readonly starPosition: ReadonlyVec3;
  /** The camera's position. */
  readonly cameraPosition: ReadonlyVec3;
}

/** The rows of the stats card, in display order. */
const CARD_FIELDS = [
  ['mode', 'Camera'],
  ['distance-camera', 'Distance to camera'],
  ['distance-star', 'Distance to Sun'],
  ['radius', 'Radius'],
  ['mass', 'Mass'],
  ['gravity', 'Surface gravity'],
  ['rotation', 'Rotation'],
  ['orbit', 'Orbital period'],
] as const;

/** A field name from {@link CARD_FIELDS}. */
type CardField = (typeof CARD_FIELDS)[number][0];

/** The card's title and its value cells, keyed by field. */
export interface CardCells {
  /** The heading showing the followed body's name. */
  readonly title: HTMLElement;
  /** One value cell per field. */
  readonly values: ReadonlyMap<CardField, HTMLElement>;
}

/**
 * Creates one labelled row and appends it.
 *
 * The row carries a stable `data-field`, so a test can address it without
 * matching on the label prose — "Camera" is a substring of "Distance to camera",
 * and a selector that cannot tell them apart is one rename away from lying.
 *
 * @param parent - The element to append to.
 * @param field - Stable identifier for the row.
 * @param label - The plain-noun label.
 * @returns The row's value cell.
 */
function appendRow(parent: HTMLElement, field: string, label: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'readout';
  row.dataset['field'] = field;

  const labelCell = document.createElement('span');
  labelCell.className = 'readout__label';
  labelCell.textContent = label;

  const valueCell = document.createElement('span');
  valueCell.className = 'readout__value';
  valueCell.textContent = '—';

  row.append(labelCell, valueCell);
  parent.append(row);
  return valueCell;
}

/**
 * Builds the stats card.
 *
 * @param parent - The element to append the card to.
 * @param initialName - The name to show before the first refresh.
 * @returns The card's title and value cells.
 */
export function buildCard(parent: HTMLElement, initialName: string): CardCells {
  const title = document.createElement('h2');
  title.className = 'browser__title';
  title.textContent = initialName;

  const card = document.createElement('div');
  card.className = 'browser__card';

  const values = new Map<CardField, HTMLElement>();
  for (const [field, label] of CARD_FIELDS) {
    values.set(field, appendRow(card, field, label));
  }

  parent.append(title, card);
  return { title, values };
}

/**
 * Formats an update into the strings the card shows.
 *
 * @param update - The body, the mode, and the three positions.
 * @returns The text for each field.
 */
export function cardText(update: CardUpdate): Readonly<Record<CardField, string>> {
  const facts = computeBodyFacts(
    update.body,
    update.bodyPosition,
    update.starPosition,
    update.cameraPosition,
  );

  return {
    mode: CAMERA_MODE_LABELS[update.mode],
    'distance-camera': formatDistance(facts.distanceFromCamera),
    'distance-star': formatDistance(facts.distanceFromStar),
    radius: formatRadius(facts.radius),
    mass: formatMass(facts.massKilograms),
    gravity: formatSurfaceGravity(facts.surfaceGravityMetersPerSecondSquared),
    rotation: formatPeriod(facts.rotationPeriod),
    orbit: formatPeriod(facts.orbitalPeriod),
  };
}

/**
 * Writes an update into the card's cells.
 *
 * @param cells - The card built by {@link buildCard}.
 * @param update - The body, the mode, and the three positions.
 */
export function writeCard(cells: CardCells, update: CardUpdate): void {
  const { title, values } = cells;
  title.textContent = update.body.name;
  const text = cardText(update);
  for (const [field, cell] of values) {
    cell.textContent = text[field];
  }
}
