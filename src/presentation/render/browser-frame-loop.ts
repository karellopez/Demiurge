/**
 * Adapters for the engine's `Clock` and `FrameScheduler` ports.
 *
 * These are the only places in the project that touch `performance.now` and
 * `requestAnimationFrame`. Everything else takes them as constructor arguments,
 * which is what lets the loop be driven by a test at whatever rate the test
 * wants, including backwards.
 *
 * @module
 */

import type { Clock, FrameScheduler } from '@features/engine/ports';
import { seconds, type Seconds } from '@shared/units';

/**
 * A clock backed by the high-resolution monotonic timer.
 *
 * `performance.now` rather than `Date.now`: the latter jumps when the system
 * clock is adjusted, which would hand the accumulator a negative delta and, at
 * best, stall a frame.
 *
 * @returns A monotonic clock in seconds.
 */
export function createPerformanceClock(): Clock {
  return {
    nowSeconds(): Seconds {
      return seconds(performance.now() / 1000);
    },
  };
}

/**
 * A scheduler backed by `requestAnimationFrame`.
 *
 * Frames stop arriving when the tab is hidden, which is exactly what the project
 * wants: rendering pauses, and the accumulator's spiral guard absorbs the large
 * delta on the way back.
 *
 * @returns A scheduler bound to the browser's frame callback.
 */
export function createAnimationFrameScheduler(): FrameScheduler {
  let pendingHandle: number | undefined;

  return {
    requestFrame(callback: () => void): void {
      pendingHandle = requestAnimationFrame(() => {
        pendingHandle = undefined;
        callback();
      });
    },

    cancel(): void {
      if (pendingHandle === undefined) {
        return;
      }

      cancelAnimationFrame(pendingHandle);
      pendingHandle = undefined;
    },
  };
}
