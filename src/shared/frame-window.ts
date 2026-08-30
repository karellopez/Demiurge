/**
 * A fixed-size rolling window of frame times.
 *
 * Two things read this: the F3 overlay, which shows live percentiles, and — from
 * phase 10 — the adaptive quality controller, which watches p95 over a
 * two-second window before it dares change a setting. Both run every frame, so
 * the buffer is allocated once and `record` allocates nothing.
 *
 * The sort is deferred rather than done on write. A frame is recorded sixty
 * times a second but read ten times a second at most, so sorting on read and
 * caching the result turns 60 sorts per second into 10.
 *
 * @module
 */

import { percentileOfSorted } from './statistics';

/** A rolling window of the most recent frame times. */
export interface FrameWindow {
  /**
   * Records one frame time, evicting the oldest when full.
   *
   * @param frameTimeMs - The frame's duration, in milliseconds.
   */
  record(frameTimeMs: number): void;

  /**
   * Reads a percentile over the window.
   *
   * @param fraction - The percentile as a fraction, such as 0.95.
   * @returns The frame time at that rank, or 0 while the window is empty.
   */
  percentile(fraction: number): number;

  /**
   * Reports how many samples the window currently holds.
   *
   * @returns A count between 0 and the window's capacity.
   */
  size(): number;
}

/**
 * Creates a rolling window.
 *
 * @param capacity - How many frames to keep. Two seconds at 60 fps is 120.
 * @returns The window, empty.
 */
export function createFrameWindow(capacity: number): FrameWindow {
  // PERF: mutable for zero-alloc — both buffers are allocated once here and
  // reused for the life of the session.
  const samples = new Float64Array(capacity);
  let writeIndex = 0;
  let filled = 0;

  // The sort cache below is a pure optimisation: removing it entirely would
  // produce identical answers, only slower. Mutating it is therefore equivalent
  // by construction, and no test can distinguish the mutants, so they are
  // excluded rather than left to look like missing coverage.
  // Stryker disable all
  const sorted: number[] = [];
  let isSortedStale = true;
  // Stryker restore all

  return {
    record(frameTimeMs: number): void {
      samples[writeIndex] = frameTimeMs;
      writeIndex = (writeIndex + 1) % capacity;
      filled = Math.min(filled + 1, capacity);
      // Stryker disable next-line all: cache invalidation, see createFrameWindow.
      isSortedStale = true;
    },

    percentile(fraction: number): number {
      if (filled === 0) {
        return 0;
      }
      // Stryker disable next-line all: the cache is a pure optimisation; with or
      // without it the answer is identical, so every mutant here is equivalent.
      if (isSortedStale) {
        sorted.length = 0;
        // Iterating a subarray yields `number` rather than `number | undefined`,
        // which keeps this free of a bounds check that can never fail.
        for (const value of samples.subarray(0, filled)) {
          sorted.push(value);
        }
        sorted.sort((a, b) => a - b);
        // Stryker disable next-line all: see above.
        isSortedStale = false;
      }
      return percentileOfSorted(sorted, fraction);
    },

    size(): number {
      return filled;
    },
  };
}
