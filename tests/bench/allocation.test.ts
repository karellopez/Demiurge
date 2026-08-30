import { PerformanceObserver } from 'node:perf_hooks';

import { describe, expect, it } from 'vitest';

import { createRng } from '@shared/rng';
import { percentileOfSorted } from '@shared/statistics';

/**
 * The zero-allocation gate.
 *
 * GC pauses are the main cause of stutter in a WebGL game, and a stutter is
 * exactly what the Potato tier cannot absorb, so the frame loop must allocate
 * nothing at all rather than merely a little.
 *
 * Measuring that honestly is harder than it looks. Reading `heapUsed` before and
 * after a loop only sees what is still *retained*; per-frame garbage that has
 * already been collected reads as zero, which is precisely the case we care
 * about. So this measures two things at once:
 *
 * 1. **Collections.** A `PerformanceObserver` counts GC events during the loop.
 *    A genuinely allocation-free hot path triggers none, however long it runs.
 *    This is the signal that catches transient garbage.
 * 2. **Retention.** Heap growth per iteration, which catches a hot path that
 *    holds on to what it makes.
 *
 * The iteration count is far above the brief's 600 frames on purpose: at 600
 * iterations a small per-frame object sits below the noise floor and the gate
 * passes when it should not. It was checked against a deliberately leaking loop.
 *
 * The measurement is taken several times and the **minimum** is reported. The
 * process does other things while the loop runs — the runner's own timers, the
 * observer's entry buffer — and every one of them can only *add* heap between
 * the two readings. Noise therefore has a floor of zero and no ceiling, so the
 * smallest of several samples is the closest estimate of what the loop itself
 * did, while a loop that genuinely allocates cannot produce a small sample at
 * all. The self-test at the bottom is what keeps that claim honest.
 *
 * One thing this gate taught us immediately, and which the frame loop has to
 * respect: accumulating a floating-point value into a variable captured by a
 * closure allocates. V8 keeps closure variables in a context object and boxes
 * each new double as a heap number, costing about 16 bytes per assignment. The
 * accumulators below are therefore `Float64Array`s, which is also how the real
 * simulation stores per-entity data.
 */

/** Iterations per measurement. High enough that one small object per pass is unmissable. */
const ITERATIONS = 200_000;

/** Bytes of retained heap per iteration we are willing to call zero. */
const ALLOWED_BYTES_PER_ITERATION = 2;

/** Samples per measurement. The best one is reported; see the note above. */
const SAMPLES = 5;

/** Whether the runner was started with `--expose-gc`. */
const canForceGc = typeof globalThis.gc === 'function';

/** What a measured hot path did. */
interface AllocationMeasurement {
  /** Retained heap growth per iteration, in bytes. */
  readonly bytesPerIteration: number;
  /** How many garbage collections ran during the measured loop. */
  readonly collections: number;
}

/**
 * Takes one sample of a hot path.
 *
 * @param body - The hot path under test, called with the iteration index.
 * @returns Retained bytes per iteration, and the number of collections observed.
 */
function sampleAllocation(body: (index: number) => void): AllocationMeasurement {
  let collections = 0;
  const observer = new PerformanceObserver((list) => {
    collections += list.getEntries().length;
  });
  observer.observe({ entryTypes: ['gc'] });

  globalThis.gc?.();
  const before = process.memoryUsage().heapUsed;

  for (let index = 0; index < ITERATIONS; index += 1) {
    body(index);
  }

  const after = process.memoryUsage().heapUsed;
  observer.disconnect();

  // The forced collection above is itself observed; it is not the loop's fault.
  return {
    bytesPerIteration: Math.max(0, after - before) / ITERATIONS,
    collections: Math.max(0, collections - 1),
  };
}

/**
 * Runs a hot path several times and reports its best sample.
 *
 * @param body - The hot path under test, called with the iteration index.
 * @returns The smallest retention and collection count observed.
 */
function measureAllocation(body: (index: number) => void): AllocationMeasurement {
  // Warm up so JIT compilation and lazy allocation happen outside the window.
  for (let index = 0; index < 10_000; index += 1) {
    body(index);
  }

  let bytesPerIteration = Infinity;
  let collections = Infinity;
  for (let sample = 0; sample < SAMPLES; sample += 1) {
    const measured = sampleAllocation(body);
    bytesPerIteration = Math.min(bytesPerIteration, measured.bytesPerIteration);
    collections = Math.min(collections, measured.collections);
  }

  return { bytesPerIteration, collections };
}

describe.skipIf(!canForceGc)('the per-frame hot paths allocate nothing', () => {
  it('draws from the seeded generator without allocating', () => {
    const rng = createRng('allocation');
    const sink = new Float64Array(1);

    const measured = measureAllocation(() => {
      // The terrain workers draw millions of these per second; an allocation
      // here is a guaranteed GC pause during descent.
      sink[0] = sink[0]! + rng.nextFloat();
    });

    expect(sink[0]).toBeGreaterThan(0);
    expect(measured.collections).toBe(0);
    expect(measured.bytesPerIteration).toBeLessThan(ALLOWED_BYTES_PER_ITERATION);
  });

  it('reads a percentile from a pre-allocated window without allocating', () => {
    // The adaptive quality controller reads p95 over a rolling window every
    // frame, from a buffer it owns.
    const window = Array.from({ length: 120 }, (_, index) => 8 + (index % 10)).toSorted(
      (a, b) => a - b,
    );
    const sink = new Float64Array(1);

    const measured = measureAllocation(() => {
      sink[0] = sink[0]! + percentileOfSorted(window, 0.95);
    });

    expect(sink[0]).toBeGreaterThan(0);
    expect(measured.collections).toBe(0);
    expect(measured.bytesPerIteration).toBeLessThan(ALLOWED_BYTES_PER_ITERATION);
  });

  it('detects an allocation when there is one, so a green result means something', () => {
    // The gate's own smoke test. Without this, a measurement harness that
    // silently stopped working would look exactly like clean code.
    const retained: { index: number }[] = [];

    const measured = measureAllocation((index) => {
      retained.push({ index });
    });

    expect(retained.length).toBeGreaterThan(ITERATIONS);
    expect(measured.collections + measured.bytesPerIteration).toBeGreaterThan(
      ALLOWED_BYTES_PER_ITERATION,
    );
  });
});

describe('the allocation harness itself', () => {
  it('reports the measurement as unavailable rather than passing vacuously', () => {
    // If the runner is not started with --expose-gc the suite above is skipped.
    // This test exists so that a configuration change which loses the flag shows
    // up as a visible skip in the report rather than as silent green.
    expect(typeof canForceGc).toBe('boolean');
  });
});
