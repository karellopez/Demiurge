import { describe, expect, it } from 'vitest';

import { hasRegressed, percentileOfSorted, summariseFrameTimes } from '@shared/statistics';

describe('percentileOfSorted', () => {
  const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  it('reads the median', () => {
    expect(percentileOfSorted(sorted, 0.5)).toBe(5);
  });

  it('reads the 95th percentile by nearest rank', () => {
    expect(percentileOfSorted(sorted, 0.95)).toBe(10);
  });

  it('never interpolates a value that was not measured', () => {
    const measured = new Set(sorted);
    for (const fraction of [0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99]) {
      expect(measured.has(percentileOfSorted(sorted, fraction))).toBe(true);
    }
  });

  it('clamps at both ends rather than reading past the array', () => {
    expect(percentileOfSorted(sorted, 0)).toBe(1);
    expect(percentileOfSorted(sorted, 1)).toBe(10);
    expect(percentileOfSorted(sorted, 5)).toBe(10);
  });

  it('returns zero for an empty sample', () => {
    expect(percentileOfSorted([], 0.95)).toBe(0);
  });
});

describe('summariseFrameTimes', () => {
  it('reports a zeroed summary when nothing was measured', () => {
    expect(summariseFrameTimes([])).toStrictEqual({
      sampleCount: 0,
      p50Ms: 0,
      p95Ms: 0,
      p99Ms: 0,
      worstMs: 0,
      meanMs: 0,
    });
  });

  it("does not mutate the caller's array", () => {
    const samples = [30, 10, 20];
    summariseFrameTimes(samples);
    expect(samples).toStrictEqual([30, 10, 20]);
  });

  it('surfaces a single hitch that an average would hide', () => {
    // 99 steady frames and one catastrophic one. The mean stays comfortable and
    // even p99 misses it - at 100 samples the 99th rank is still a good frame -
    // but the worst-frame figure tells the truth. This is exactly why the tier
    // budgets gate on p95 *and* a worst-frame ceiling rather than on either one.
    const samples = [...Array.from({ length: 99 }, () => 16), 900];
    const summary = summariseFrameTimes(samples);
    expect(summary.meanMs).toBeLessThan(26);
    expect(summary.p99Ms).toBe(16);
    expect(summary.worstMs).toBe(900);
  });

  it('catches a hitch in the tail once it is frequent enough to rank', () => {
    const samples = [...Array.from({ length: 96 }, () => 16), 900, 900, 900, 900];
    expect(summariseFrameTimes(samples).p99Ms).toBe(900);
  });

  it('counts every sample', () => {
    expect(summariseFrameTimes([1, 2, 3]).sampleCount).toBe(3);
  });

  it('reports the arithmetic mean exactly', () => {
    expect(summariseFrameTimes([10, 20, 30, 40]).meanMs).toBe(25);
  });

  it('reports every figure of a known sample', () => {
    const summary = summariseFrameTimes([16, 8, 12, 40, 20]);
    expect(summary).toStrictEqual({
      sampleCount: 5,
      p50Ms: 16,
      p95Ms: 40,
      p99Ms: 40,
      worstMs: 40,
      meanMs: 19.2,
    });
  });

  it('orders the percentiles', () => {
    const summary = summariseFrameTimes(Array.from({ length: 200 }, (_, i) => i));
    expect(summary.p50Ms).toBeLessThanOrEqual(summary.p95Ms);
    expect(summary.p95Ms).toBeLessThanOrEqual(summary.p99Ms);
    expect(summary.p99Ms).toBeLessThanOrEqual(summary.worstMs);
  });
});

describe('hasRegressed', () => {
  it('accepts a measurement inside the tolerance', () => {
    expect(hasRegressed(10.9, 10, 0.1)).toBe(false);
  });

  it('accepts a measurement exactly at the tolerance', () => {
    expect(hasRegressed(11, 10, 0.1)).toBe(false);
  });

  it('rejects a measurement past the tolerance', () => {
    expect(hasRegressed(11.01, 10, 0.1)).toBe(true);
  });

  it('accepts an improvement', () => {
    expect(hasRegressed(6, 10, 0.1)).toBe(false);
  });
});
