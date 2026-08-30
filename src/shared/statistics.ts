/**
 * Frame-time statistics.
 *
 * Averages hide exactly the thing this project cares about. A 60 fps average
 * with one 90 ms hitch every two seconds is a worse experience than a steady
 * 45 fps, and only the tail shows that, so percentiles are the unit of
 * measurement everywhere: in the benchmark, on the F3 overlay, and in the
 * adaptive quality controller, which watches p95 over a rolling window before it
 * dares to change anything.
 *
 * Everything here operates on a caller-owned array and allocates nothing beyond
 * what it is handed, because the adaptive controller calls it every frame.
 *
 * @module
 */

/** A summary of a sample of frame times, in milliseconds. */
export interface FrameTimeSummary {
  /** How many samples were measured. */
  readonly sampleCount: number;
  /** Median frame time. */
  readonly p50Ms: number;
  /** 95th-percentile frame time; the number the tier budgets gate on. */
  readonly p95Ms: number;
  /** 99th-percentile frame time. */
  readonly p99Ms: number;
  /** The single worst frame. A stutter shows up here first. */
  readonly worstMs: number;
  /** Arithmetic mean, reported for context only; never gated on. */
  readonly meanMs: number;
}

/**
 * Reads a percentile from an already-sorted sample.
 *
 * Uses nearest-rank, which needs no interpolation and so cannot invent a frame
 * time that never occurred.
 *
 * @param sortedSamples - Samples in ascending order. Must not be empty.
 * @param fraction - The percentile as a fraction, such as 0.95.
 * @returns The sample at that rank.
 */
export function percentileOfSorted(sortedSamples: readonly number[], fraction: number): number {
  const lastIndex = sortedSamples.length - 1;
  const rank = Math.ceil(fraction * sortedSamples.length) - 1;
  const index = Math.min(lastIndex, Math.max(0, rank));
  return sortedSamples[index] ?? 0;
}

/**
 * Summarises a sample of frame times.
 *
 * @param samples - Frame times in milliseconds, in any order. Copied, never sorted in place.
 * @returns The summary, or a zeroed summary when there are no samples.
 */
export function summariseFrameTimes(samples: readonly number[]): FrameTimeSummary {
  if (samples.length === 0) {
    return { sampleCount: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, worstMs: 0, meanMs: 0 };
  }

  const sorted = samples.toSorted((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);

  return {
    sampleCount: sorted.length,
    p50Ms: percentileOfSorted(sorted, 0.5),
    p95Ms: percentileOfSorted(sorted, 0.95),
    p99Ms: percentileOfSorted(sorted, 0.99),
    worstMs: percentileOfSorted(sorted, 1),
    meanMs: total / sorted.length,
  };
}

/**
 * Reports whether a measurement has regressed against a baseline.
 *
 * The benchmark tolerates a little noise — CI runners are not quiet machines —
 * but a sustained move beyond the tolerance fails the run.
 *
 * @param measuredMs - The frame time just measured.
 * @param baselineMs - The committed baseline for this tier.
 * @param tolerance - Allowed fractional increase, such as 0.1 for ten per cent.
 * @returns True when the measurement is worse than the baseline plus tolerance.
 */
export function hasRegressed(measuredMs: number, baselineMs: number, tolerance: number): boolean {
  return measuredMs > baselineMs * (1 + tolerance);
}
