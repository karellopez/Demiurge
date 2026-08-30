import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createAnimationFrameScheduler,
  createPerformanceClock,
} from '@presentation/render/browser-frame-loop';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the performance clock', () => {
  it('reports seconds, not milliseconds', () => {
    vi.spyOn(performance, 'now').mockReturnValue(2500);
    expect(createPerformanceClock().nowSeconds()).toBe(2.5);
  });

  it('advances as the underlying timer does', () => {
    const now = vi.spyOn(performance, 'now');
    const clock = createPerformanceClock();

    now.mockReturnValue(1000);
    const first = clock.nowSeconds();
    now.mockReturnValue(1016);
    const second = clock.nowSeconds();

    expect(second - first).toBeCloseTo(0.016, 9);
  });
});

describe('the animation-frame scheduler', () => {
  it('runs the callback on the next frame', () => {
    const requested: FrameRequestCallback[] = [];
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
      requested.push(callback);
      return requested.length;
    });

    const scheduler = createAnimationFrameScheduler();
    const onFrame = vi.fn();
    scheduler.requestFrame(onFrame);

    expect(onFrame).not.toHaveBeenCalled();
    requested[0]!(0);
    expect(onFrame).toHaveBeenCalledOnce();
  });

  it('cancels a pending frame', () => {
    vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(7);
    const cancel = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(vi.fn());

    const scheduler = createAnimationFrameScheduler();
    scheduler.requestFrame(vi.fn());
    scheduler.cancel();

    expect(cancel).toHaveBeenCalledWith(7);
  });

  it('does not cancel anything when no frame is pending', () => {
    const cancel = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(vi.fn());
    createAnimationFrameScheduler().cancel();
    expect(cancel).not.toHaveBeenCalled();
  });

  it('does not cancel a frame that has already run', () => {
    const requested: FrameRequestCallback[] = [];
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
      requested.push(callback);
      return requested.length;
    });
    const cancel = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(vi.fn());

    const scheduler = createAnimationFrameScheduler();
    scheduler.requestFrame(vi.fn());
    requested[0]!(0);
    scheduler.cancel();

    expect(cancel).not.toHaveBeenCalled();
  });
});
