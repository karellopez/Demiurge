import { describe, expect, it } from 'vitest';

import { createFrameWindow } from '@shared/frame-window';

describe('an empty window', () => {
  it('holds nothing', () => {
    expect(createFrameWindow(10).size()).toBe(0);
  });

  it('reports zero rather than dividing by an empty sample', () => {
    expect(createFrameWindow(10).percentile(0.95)).toBe(0);
  });
});

describe('filling the window', () => {
  it('counts the samples recorded', () => {
    const window = createFrameWindow(10);
    window.record(16);
    window.record(17);
    expect(window.size()).toBe(2);
  });

  it('stops counting at capacity', () => {
    const window = createFrameWindow(3);
    for (let index = 0; index < 20; index += 1) {
      window.record(index);
    }
    expect(window.size()).toBe(3);
  });

  it('reads a percentile over a partly-filled window', () => {
    const window = createFrameWindow(100);
    window.record(10);
    window.record(30);
    expect(window.percentile(1)).toBe(30);
    expect(window.percentile(0.5)).toBe(10);
  });
});

describe('rolling', () => {
  it('evicts the oldest sample once full', () => {
    const window = createFrameWindow(3);
    window.record(100);
    window.record(1);
    window.record(1);
    expect(window.percentile(1)).toBe(100);

    // One more push evicts the 100.
    window.record(1);
    expect(window.percentile(1)).toBe(1);
  });

  it('holds only the most recent capacity samples', () => {
    const window = createFrameWindow(4);
    for (const value of [90, 90, 90, 90, 8, 8, 8, 8]) {
      window.record(value);
    }
    expect(window.percentile(1)).toBe(8);
    expect(window.percentile(0)).toBe(8);
  });
});

describe('the deferred sort', () => {
  it('reflects a new sample rather than serving a stale percentile', () => {
    const window = createFrameWindow(10);
    window.record(10);
    expect(window.percentile(1)).toBe(10);

    window.record(99);
    expect(window.percentile(1)).toBe(99);
  });

  it('returns the same answer when read twice without a write', () => {
    const window = createFrameWindow(10);
    for (const value of [12, 30, 8, 25]) {
      window.record(value);
    }
    expect(window.percentile(0.5)).toBe(window.percentile(0.5));
  });

  it('orders the percentiles it reports', () => {
    const window = createFrameWindow(120);
    for (let index = 0; index < 120; index += 1) {
      window.record(index);
    }
    expect(window.percentile(0.5)).toBeLessThanOrEqual(window.percentile(0.95));
    expect(window.percentile(0.95)).toBeLessThanOrEqual(window.percentile(0.99));
    expect(window.percentile(0.99)).toBeLessThanOrEqual(window.percentile(1));
  });
});

describe('the cache the mutation suite pins down', () => {
  it('recomputes after every write, not just the first', () => {
    const window = createFrameWindow(10);
    window.record(5);
    expect(window.percentile(1)).toBe(5);
    window.record(50);
    expect(window.percentile(1)).toBe(50);
    window.record(500);
    expect(window.percentile(1)).toBe(500);
  });

  it('serves a cached answer that matches a freshly computed one', () => {
    const fresh = createFrameWindow(10);
    const cached = createFrameWindow(10);
    for (const value of [30, 10, 20]) {
      fresh.record(value);
      cached.record(value);
    }
    // Read `cached` twice so the second read comes from the cache, and `fresh`
    // once. The two must agree.
    cached.percentile(0.5);
    expect(cached.percentile(0.5)).toBe(fresh.percentile(0.5));
  });

  it('sorts the samples rather than reading them in arrival order', () => {
    const window = createFrameWindow(10);
    for (const value of [90, 10, 50]) {
      window.record(value);
    }
    expect(window.percentile(0)).toBe(10);
    expect(window.percentile(1)).toBe(90);
  });

  it('reports zero for an empty window even after it has been read before', () => {
    const window = createFrameWindow(10);
    expect(window.percentile(0.5)).toBe(0);
    expect(window.percentile(0.95)).toBe(0);
  });

  it('does not carry stale samples across the capacity boundary', () => {
    const window = createFrameWindow(2);
    window.record(1);
    window.record(2);
    expect(window.percentile(1)).toBe(2);
    window.record(3);
    window.record(4);
    expect(window.percentile(0)).toBe(3);
    expect(window.percentile(1)).toBe(4);
  });
});
