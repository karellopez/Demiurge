import { beforeEach, describe, expect, it } from 'vitest';

import { QualityTier } from '@domain/quality-tier';
import type { FrameStats } from '@features/engine/ports';
import { mountStatsOverlay, type StatsOverlay } from '@presentation/ui/stats-overlay';
import { seconds } from '@shared/units';

let host: HTMLElement;
let currentMs: number;
let overlay: StatsOverlay;

/**
 * Builds a frame-stats record, overriding only what a test is about.
 *
 * @param overrides - The fields under test.
 * @returns A complete record.
 */
function aFrame(overrides: Partial<FrameStats> = {}): FrameStats {
  return {
    frameTimeMs: 16.7,
    steps: 2,
    droppedSeconds: seconds(0),
    simTimeSeconds: seconds(12.5),
    drawCalls: 42,
    triangles: 9876,
    ...overrides,
  };
}

/**
 * Publishes a frame and lets enough time pass for the throttle to allow a write.
 *
 * @param stats - The frame to publish.
 */
function publishAndRefresh(stats: FrameStats): void {
  currentMs += 1000;
  overlay.publish(stats);
}

beforeEach(() => {
  document.body.innerHTML = '<main id="app"></main>';
  host = document.querySelector<HTMLElement>('#app')!;
  currentMs = 0;
  overlay = mountStatsOverlay(host, QualityTier.Low, () => currentMs);
});

describe('visibility', () => {
  it('starts hidden, because F3 is opt-in', () => {
    expect(overlay.isVisible()).toBe(false);
  });

  it('toggles on and off', () => {
    overlay.toggle();
    expect(overlay.isVisible()).toBe(true);
    overlay.toggle();
    expect(overlay.isVisible()).toBe(false);
  });

  it('removes itself when disposed', () => {
    overlay.dispose();
    expect(host.querySelector('.stats')).toBeNull();
  });
});

describe('what it reports', () => {
  beforeEach(() => {
    overlay.toggle();
  });

  it('shows the frame time', () => {
    publishAndRefresh(aFrame({ frameTimeMs: 16.666 }));
    expect(host.textContent).toContain('16.67 ms');
  });

  it('shows draw calls against the tier budget', () => {
    publishAndRefresh(aFrame({ drawCalls: 42 }));
    // The Low tier budget is 700 draw calls.
    expect(host.textContent).toContain('42 / 700');
  });

  it('shows the triangle count', () => {
    publishAndRefresh(aFrame({ triangles: 9876 }));
    expect(host.textContent).toContain('9,876');
  });

  it('shows the steps that ran and the time abandoned', () => {
    publishAndRefresh(aFrame({ steps: 3, droppedSeconds: seconds(0.25) }));
    expect(host.textContent).toContain('3 / 0.250 s');
  });

  it('shows simulation time', () => {
    publishAndRefresh(aFrame({ simTimeSeconds: seconds(12.55) }));
    expect(host.textContent).toContain('12.6 s');
  });

  it('reports percentiles once frames have accumulated', () => {
    for (const frameTimeMs of [10, 12, 14, 16, 18]) {
      publishAndRefresh(aFrame({ frameTimeMs }));
    }
    expect(host.textContent).toMatch(/\d{1,4}\.\d \/ \d{1,4}\.\d \/ \d{1,4}\.\d ms/u);
  });
});

describe('marking a reading over budget', () => {
  beforeEach(() => {
    overlay.toggle();
  });

  it('flags draw calls above the tier budget', () => {
    publishAndRefresh(aFrame({ drawCalls: 900 }));
    expect(host.querySelectorAll('.stat__value--over').length).toBeGreaterThan(0);
  });

  it('does not flag draw calls inside the budget', () => {
    publishAndRefresh(aFrame({ drawCalls: 100 }));
    const flagged = [...host.querySelectorAll('.stat__value--over')];
    expect(flagged.some((cell) => cell.textContent.includes('100'))).toBe(false);
  });

  it('flags a frame where simulated time was abandoned', () => {
    publishAndRefresh(aFrame({ droppedSeconds: seconds(0.5) }));
    const flagged = [...host.querySelectorAll('.stat__value--over')];
    expect(flagged.some((cell) => cell.textContent.includes('0.500'))).toBe(true);
  });

  it('flags a p95 above the tier budget', () => {
    // The Low tier gates p95 at 18 ms; these frames are far worse.
    for (let frame = 0; frame < 10; frame += 1) {
      publishAndRefresh(aFrame({ frameTimeMs: 90 }));
    }
    const flagged = [...host.querySelectorAll('.stat__value--over')];
    expect(flagged.some((cell) => cell.textContent.includes('90.0'))).toBe(true);
  });
});

describe('the throttle', () => {
  it('does not touch the DOM more than ten times a second', () => {
    overlay.toggle();
    publishAndRefresh(aFrame({ frameTimeMs: 11.11 }));

    // A second frame arriving one millisecond later must not be written.
    currentMs += 1;
    overlay.publish(aFrame({ frameTimeMs: 99.99 }));

    expect(host.textContent).toContain('11.11 ms');
    expect(host.textContent).not.toContain('99.99 ms');
  });

  it('writes again once the interval has passed', () => {
    overlay.toggle();
    publishAndRefresh(aFrame({ frameTimeMs: 11.11 }));
    publishAndRefresh(aFrame({ frameTimeMs: 22.22 }));
    expect(host.textContent).toContain('22.22 ms');
  });

  it('keeps recording frame times while hidden, so percentiles are warm on open', () => {
    for (let frame = 0; frame < 30; frame += 1) {
      currentMs += 16;
      overlay.publish(aFrame({ frameTimeMs: 40 }));
    }
    overlay.toggle();
    publishAndRefresh(aFrame({ frameTimeMs: 40 }));
    expect(host.textContent).toContain('40.0 / 40.0 / 40.0 ms');
  });

  it('rolls the window rather than growing without bound', () => {
    overlay.toggle();
    // Fill the 120-frame window with slow frames, then flush it with fast ones.
    for (let frame = 0; frame < 130; frame += 1) {
      currentMs += 1;
      overlay.publish(aFrame({ frameTimeMs: 90 }));
    }
    for (let frame = 0; frame < 130; frame += 1) {
      currentMs += 1;
      overlay.publish(aFrame({ frameTimeMs: 8 }));
    }
    publishAndRefresh(aFrame({ frameTimeMs: 8 }));
    expect(host.textContent).toContain('8.0 / 8.0 / 8.0 ms');
  });
});
