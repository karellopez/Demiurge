/**
 * Adapter: the title screen, and the diagnostics sink that writes into it.
 *
 * The interface vocabulary is instrumentation rather than chrome — thin strokes,
 * tabular numerals, plain nouns for labels. Numeric readouts are written with
 * `textContent` on a throttled tick, never through a reactive re-render, because
 * a per-frame diff of the DOM is exactly the kind of allocation the frame budget
 * cannot absorb.
 *
 * @module
 */

import { budgetFor } from '@domain/quality-tier';
import type { BootReport, DiagnosticsSink } from '@features/diagnostics/ports';
import { toRawMeters } from '@shared/units';

/** Copy for the title screen. Reverent about the cosmos, unbothered by ruin. */
const TAGLINE = 'Shape a solar system with your hands. Unmake it at your leisure.';

/** Em dash used as the placeholder for a readout with no value yet. */
const NO_VALUE = '—';

/** One labelled readout row, with its value cell kept for later updates. */
interface Readout {
  readonly row: HTMLElement;
  readonly valueCell: HTMLElement;
}

/**
 * Creates one labelled readout row.
 *
 * @param label - The plain-noun label, such as `Draw call budget`.
 * @returns The row element, with its value cell exposed for later updates.
 */
function createReadout(label: string): Readout {
  const row = document.createElement('div');
  row.className = 'readout';

  const labelCell = document.createElement('span');
  labelCell.className = 'readout__label';
  labelCell.textContent = label;

  const valueCell = document.createElement('span');
  valueCell.className = 'readout__value';
  valueCell.textContent = NO_VALUE;

  row.append(labelCell, valueCell);
  return { row, valueCell };
}

/**
 * Formats a length for a person rather than for a machine.
 *
 * @param lengthMeters - The length to render.
 * @returns A short string with a unit, such as `0.5 m` or `50 cm`.
 */
function formatLength(lengthMeters: number): string {
  return lengthMeters < 1
    ? `${String(Math.round(lengthMeters * 100))} cm`
    : `${lengthMeters.toFixed(1)} m`;
}

/** The readout cells the title screen fills in once the tier is known. */
interface BootReadouts {
  readonly seed: HTMLElement;
  readonly tier: HTMLElement;
  readonly target: HTMLElement;
  readonly drawCalls: HTMLElement;
  readonly terrain: HTMLElement;
  readonly renderer: HTMLElement;
}

/**
 * Builds the panel of readouts.
 *
 * @param parent - The element to append the panel to.
 * @returns The value cells, kept for the report to fill in.
 */
function buildReadoutPanel(parent: HTMLElement): BootReadouts {
  const panel = document.createElement('div');
  panel.className = 'boot-screen__panel';

  const rows = [
    createReadout('Session seed'),
    createReadout('Quality tier'),
    createReadout('Frame target'),
    createReadout('Draw call budget'),
    createReadout('Terrain detail'),
    createReadout('Renderer'),
  ] as const;

  for (const row of rows) {
    panel.append(row.row);
  }
  parent.append(panel);

  return {
    seed: rows[0].valueCell,
    tier: rows[1].valueCell,
    target: rows[2].valueCell,
    drawCalls: rows[3].valueCell,
    terrain: rows[4].valueCell,
    renderer: rows[5].valueCell,
  };
}

/** The title screen: a diagnostics sink that can also get out of the way. */
export interface BootScreen extends DiagnosticsSink {
  /** Removes the title screen, revealing the simulation behind it. */
  dismiss(): void;
}

/**
 * Mounts the title screen into a host element.
 *
 * @param host - The element the screen is mounted into. Its content is replaced.
 * @returns A sink that renders boot diagnostics, and can dismiss itself.
 */
export function mountBootScreen(host: HTMLElement): BootScreen {
  host.replaceChildren();

  const screen = document.createElement('section');
  screen.className = 'boot-screen';

  const title = document.createElement('h1');
  title.className = 'boot-screen__title';
  title.textContent = 'DEMIURGE';

  const tagline = document.createElement('p');
  tagline.className = 'boot-screen__tagline';
  tagline.textContent = TAGLINE;

  const cells = buildReadoutPanel(screen);

  const reason = document.createElement('p');
  reason.className = 'boot-screen__reason';

  const prompt = document.createElement('p');
  prompt.className = 'boot-screen__prompt';
  prompt.textContent = 'Press any key to begin';

  screen.append(reason, prompt);
  screen.prepend(title, tagline);
  host.append(screen);

  return {
    report({ selection, capabilities, seedPhrase }: BootReport): void {
      const budget = budgetFor(selection.tier);
      const fps = String(budget.targetFramesPerSecond);

      cells.seed.textContent = seedPhrase;
      cells.tier.textContent = selection.tier.toUpperCase();
      cells.target.textContent = `${fps} fps · p95 ${budget.frameTimeP95Ms.toFixed(1)} ms`;
      cells.drawCalls.textContent = String(budget.maxDrawCalls);
      cells.terrain.textContent = `${formatLength(toRawMeters(budget.terrainVertexSpacing))} per vertex`;
      cells.renderer.textContent =
        capabilities.rendererDescription === ''
          ? 'not disclosed'
          : capabilities.rendererDescription;
      reason.textContent = selection.reason;
    },

    dismiss(): void {
      screen.remove();
    },
  };
}

/**
 * A sink that mirrors the boot report to the developer console.
 *
 * The brief requires the detected tier and its reasoning to be printed, so that
 * a performance report from a player carries the same evidence the settings
 * panel shows.
 *
 * @returns A console-backed diagnostics sink.
 */
export function createConsoleDiagnosticsSink(): DiagnosticsSink {
  return {
    report({ selection, capabilities, seedPhrase }: BootReport): void {
      console.info(
        [
          `[demiurge] quality tier: ${selection.tier}`,
          `  ${selection.reason}`,
          `  seed="${seedPhrase}"`,
          `  webgl2=${String(capabilities.supportsWebGL2)} cores=${String(capabilities.hardwareConcurrency)}`,
        ].join('\n'),
      );
    },
  };
}

/**
 * Fans one report out to several sinks.
 *
 * @param sinks - The sinks to notify, in order.
 * @returns A sink that forwards to all of them.
 */
export function combineDiagnosticsSinks(sinks: readonly DiagnosticsSink[]): DiagnosticsSink {
  return {
    report(report: BootReport): void {
      for (const sink of sinks) {
        sink.report(report);
      }
    },
  };
}
