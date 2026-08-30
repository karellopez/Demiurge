import type {
  Clock,
  FrameScheduler,
  FrameStats,
  SceneRenderer,
  StatsSink,
} from '@features/engine/ports';
import { seconds, type Seconds } from '@shared/units';

/** A clock the test advances by hand. */
export interface FakeClock extends Clock {
  /**
   * Moves the clock forward.
   *
   * @param deltaSeconds - How far to advance. May be negative, to model a
   *   clock that jumped backwards.
   */
  advance(deltaSeconds: number): void;
}

/**
 * Creates a clock under the test's control.
 *
 * @param startSeconds - The initial reading.
 * @returns A clock that only moves when told to.
 */
export function createFakeClock(startSeconds = 0): FakeClock {
  let current = startSeconds;
  return {
    nowSeconds: (): Seconds => seconds(current),
    advance(deltaSeconds: number): void {
      current += deltaSeconds;
    },
  };
}

/** A scheduler the test pumps by hand. */
export interface FakeScheduler extends FrameScheduler {
  /**
   * Runs the pending frame callback, if there is one.
   *
   * @returns True when a frame ran.
   */
  runPendingFrame(): boolean;
  /** Whether a frame is currently scheduled. */
  hasPendingFrame(): boolean;
  /** How many times `cancel` was called. */
  cancelCount(): number;
}

/**
 * Creates a scheduler that never runs anything on its own.
 *
 * @returns A scheduler the test pumps.
 */
export function createFakeScheduler(): FakeScheduler {
  let pending: (() => void) | undefined;
  let cancels = 0;

  return {
    requestFrame(callback: () => void): void {
      pending = callback;
    },
    cancel(): void {
      pending = undefined;
      cancels += 1;
    },
    runPendingFrame(): boolean {
      const callback = pending;
      if (callback === undefined) {
        return false;
      }
      pending = undefined;
      callback();
      return true;
    },
    hasPendingFrame: (): boolean => pending !== undefined,
    cancelCount: (): number => cancels,
  };
}

/** A scene that records what the engine asked of it. */
export interface RecordingScene extends SceneRenderer {
  /** Simulation times passed to `step`, in order. */
  readonly stepTimes: number[];
  /** Interpolation values passed to `render`, in order. */
  readonly renderAlphas: number[];
  /** How many times `dispose` was called. */
  disposeCount(): number;
}

/**
 * Creates a scene that records rather than draws.
 *
 * @returns A recording scene.
 */
export function createRecordingScene(): RecordingScene {
  const stepTimes: number[] = [];
  const renderAlphas: number[] = [];
  let disposals = 0;

  return {
    stepTimes,
    renderAlphas,
    step(simTimeSeconds: Seconds): void {
      stepTimes.push(simTimeSeconds);
    },
    render(interpolationAlpha: number): void {
      renderAlphas.push(interpolationAlpha);
    },
    readCounters: (): { drawCalls: number; triangles: number } => ({
      drawCalls: 7,
      triangles: 1234,
    }),
    dispose(): void {
      disposals += 1;
    },
    disposeCount: (): number => disposals,
  };
}

/** A stats sink that keeps a copy of every published frame. */
export interface RecordingStats extends StatsSink {
  /** Copies of the published frames, in order. */
  readonly published: FrameStats[];
}

/**
 * Creates a stats sink that copies what it is given.
 *
 * The engine reuses one mutable stats object, so a sink that kept the reference
 * would end up with N pointers to the same final frame. Copying here is what
 * makes the assertions meaningful.
 *
 * @returns A recording stats sink.
 */
export function createRecordingStats(): RecordingStats {
  const published: FrameStats[] = [];
  return {
    published,
    publish(stats: FrameStats): void {
      published.push({ ...stats });
    },
  };
}
