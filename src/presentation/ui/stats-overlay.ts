/**
 * Adapter: the F3 statistics overlay.
 *
 * This is instrumentation, and it is held to the same rule as everything else in
 * the frame loop: publishing a frame's numbers must not allocate. Two things
 * follow from that.
 *
 * First, the DOM is written on a throttled 10 Hz tick rather than every frame.
 * Digits changing sixty times a second are unreadable anyway, and a per-frame
 * DOM write is both a layout cost and a string allocation.
 *
 * Second, frame times accumulate into `shared/frame-window.ts`, a pre-allocated
 * ring buffer. The overlay therefore reports the same p50/p95/p99 the benchmark
 * does, from the same code, without producing garbage while it watches for
 * garbage.
 *
 * @module
 */

import { budgetFor, type QualityTier } from '@domain/quality-tier';
import type { FrameStats, StatsSink } from '@features/engine/ports';
import { createFrameWindow } from '@shared/frame-window';

/** Frames kept for the rolling percentiles. Two seconds at 60 fps. */
const WINDOW_FRAMES = 120;

/** Milliseconds between DOM writes. Ten updates a second stays readable. */
const REFRESH_INTERVAL_MS = 100;

/** The value cells the overlay writes into. */
interface StatCells {
  readonly frame: HTMLElement;
  readonly percentiles: HTMLElement;
  readonly drawCalls: HTMLElement;
  readonly triangles: HTMLElement;
  readonly steps: HTMLElement;
  readonly simTime: HTMLElement;
}

/**
 * Creates a labelled row and appends it.
 *
 * @param parent - The element to append to.
 * @param label - The plain-noun label.
 * @returns The row's value cell, kept for later writes.
 */
function appendRow(parent: HTMLElement, label: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'stat';

  const labelCell = document.createElement('span');
  labelCell.className = 'stat__label';
  labelCell.textContent = label;

  const valueCell = document.createElement('span');
  valueCell.className = 'stat__value';
  valueCell.textContent = '—';

  row.append(labelCell, valueCell);
  parent.append(row);
  return valueCell;
}

/**
 * Builds the overlay panel.
 *
 * @param host - The element to mount into.
 * @returns The panel and the value cells inside it.
 */
function buildPanel(host: HTMLElement): { panel: HTMLElement; cells: StatCells } {
  const panel = document.createElement('aside');
  panel.className = 'stats';
  panel.hidden = true;

  const cells: StatCells = {
    frame: appendRow(panel, 'Frame'),
    percentiles: appendRow(panel, 'p50 / p95 / p99'),
    drawCalls: appendRow(panel, 'Draw calls'),
    triangles: appendRow(panel, 'Triangles'),
    steps: appendRow(panel, 'Steps / dropped'),
    simTime: appendRow(panel, 'Sim time'),
  };

  host.append(panel);
  return { panel, cells };
}

/** An overlay that can be shown, hidden and torn down. */
export interface StatsOverlay extends StatsSink {
  /** Shows or hides the overlay, as `F3` does. */
  toggle(): void;
  /** Whether the overlay is currently visible. */
  isVisible(): boolean;
  /** Removes the overlay from the document. */
  dispose(): void;
}

/**
 * Mounts the statistics overlay.
 *
 * @param host - The element to mount into.
 * @param tier - The tier whose budget the readings are compared against.
 * @param nowMs - Reads wall-clock milliseconds. Injected so tests control the throttle.
 * @returns The overlay, which is also the engine's stats sink.
 */
export function mountStatsOverlay(
  host: HTMLElement,
  tier: QualityTier,
  nowMs: () => number,
): StatsOverlay {
  const budget = budgetFor(tier);
  const { panel, cells } = buildPanel(host);
  const window = createFrameWindow(WINDOW_FRAMES);
  let lastRefreshMs = -Infinity;

  /**
   * Writes the current readings into the DOM.
   *
   * @param stats - The most recent frame.
   */
  const refresh = (stats: FrameStats): void => {
    const p50 = window.percentile(0.5);
    const p95 = window.percentile(0.95);
    const p99 = window.percentile(0.99);

    cells.frame.textContent = `${stats.frameTimeMs.toFixed(2)} ms`;
    cells.percentiles.textContent = `${p50.toFixed(1)} / ${p95.toFixed(1)} / ${p99.toFixed(1)} ms`;
    cells.percentiles.classList.toggle('stat__value--over', p95 > budget.frameTimeP95Ms);

    cells.drawCalls.textContent = `${String(stats.drawCalls)} / ${String(budget.maxDrawCalls)}`;
    cells.drawCalls.classList.toggle('stat__value--over', stats.drawCalls > budget.maxDrawCalls);

    cells.triangles.textContent = stats.triangles.toLocaleString('en-GB');
    cells.steps.textContent = `${String(stats.steps)} / ${stats.droppedSeconds.toFixed(3)} s`;
    cells.steps.classList.toggle('stat__value--over', stats.droppedSeconds > 0);
    cells.simTime.textContent = `${stats.simTimeSeconds.toFixed(1)} s`;
  };

  return {
    publish(stats: FrameStats): void {
      window.record(stats.frameTimeMs);
      if (panel.hidden) {
        return;
      }
      const now = nowMs();
      if (now - lastRefreshMs < REFRESH_INTERVAL_MS) {
        return;
      }
      lastRefreshMs = now;
      refresh(stats);
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
