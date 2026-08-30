/**
 * Adapter: the persistent bottom bar — seed, simulated date, and time warp.
 *
 * It implements {@link StatsSink}, which is the port the engine already
 * publishes to every frame — the simulated time is in `FrameStats`, so the HUD
 * needs no second source of truth and no second port. Like the F3 overlay it
 * writes the DOM on a throttled tick rather than sixty times a second.
 *
 * The seed lives here rather than only on the title screen, which dismisses
 * itself once the simulation is up. A universe you cannot name is a universe you
 * cannot share or report a bug against, so its identity stays on screen.
 *
 * The date also carries a warning once it leaves the window the orbital element
 * fit covers. Twenty seconds at the top of the time-warp ladder is enough to get
 * there, and the positions go on looking authoritative the whole way.
 *
 * @module
 */

import { FIT_FIRST_YEAR, FIT_LAST_YEAR, isWithinFittedWindow } from '@domain/orbits/validity';
import { formatSimTime } from '@domain/time/julian';
import { labelFor, type TimeScaleState } from '@domain/time-scale';
import type { FrameStats, StatsSink } from '@features/engine/ports';

/** Milliseconds between DOM writes. Ten a second is readable and cheap. */
const REFRESH_INTERVAL_MS = 100;

/** The date and rate readout. */
export interface TimeHud extends StatsSink {
  /**
   * Shows a new time-warp setting.
   *
   * Called on change rather than per frame, because the rate only changes when
   * the player asks it to.
   *
   * @param state - The new position on the ladder.
   */
  setTimeScale(state: TimeScaleState): void;
  /** Removes the readout from the document. */
  dispose(): void;
}

/**
 * Mounts the time readout.
 *
 * @param host - The element to mount into.
 * @param seedPhrase - The universe's identity, kept on screen so it can be shared.
 * @param nowMs - Reads wall-clock milliseconds, so a test controls the throttle.
 * @returns The readout, which is also a stats sink.
 */
export function mountTimeHud(host: HTMLElement, seedPhrase: string, nowMs: () => number): TimeHud {
  const panel = document.createElement('div');
  panel.className = 'time-hud';

  const seedCell = document.createElement('span');
  seedCell.className = 'time-hud__seed';
  seedCell.textContent = seedPhrase;

  const dateCell = document.createElement('span');
  dateCell.className = 'time-hud__date';
  dateCell.textContent = '—';

  const rateCell = document.createElement('span');
  rateCell.className = 'time-hud__rate';
  rateCell.textContent = '1x';

  panel.append(seedCell, dateCell, rateCell);
  host.append(panel);

  let lastRefreshMs = -Infinity;

  return {
    publish(stats: FrameStats): void {
      const now = nowMs();
      if (now - lastRefreshMs < REFRESH_INTERVAL_MS) {
        return;
      }
      lastRefreshMs = now;
      dateCell.textContent = formatSimTime(stats.simTimeSeconds);

      // Outside the fit the positions degrade smoothly rather than failing, so
      // nothing else on screen would ever say so.
      const isFitted = isWithinFittedWindow(stats.simTimeSeconds);
      dateCell.classList.toggle('time-hud__date--unfitted', !isFitted);
      dateCell.title = isFitted
        ? ''
        : `Outside the ${String(FIT_FIRST_YEAR)}–${String(FIT_LAST_YEAR)} element fit; positions are approximate.`;
    },

    setTimeScale(state: TimeScaleState): void {
      const label = labelFor(state);
      rateCell.textContent = label;
      // Paused and reversed are states a player must be able to notice at a
      // glance, and colour alone is not enough to convey either.
      rateCell.classList.toggle('time-hud__rate--paused', label === 'paused');
      rateCell.classList.toggle('time-hud__rate--reverse', label.startsWith('-'));
    },

    dispose(): void {
      panel.remove();
    },
  };
}
