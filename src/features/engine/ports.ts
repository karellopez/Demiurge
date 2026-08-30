/**
 * Ports the engine declares. `presentation/` supplies the adapters.
 *
 * Nothing here mentions three.js, `requestAnimationFrame` or `performance`. That
 * is what lets the loop's timing rules be tested in Node against a clock that
 * advances by whatever the test says, including backwards and in ten-minute
 * jumps.
 *
 * @module
 */

import type { Seconds } from '@shared/units';

/**
 * The only source of time in the project.
 *
 * `new Date()` and `performance.now()` are banned inside `domain/` and
 * `shared/` by lint. Everything that needs to know what time it is asks a
 * `Clock`, which is what makes a replay, a benchmark and a test able to drive
 * the simulation at a rate of their own choosing.
 */
export interface Clock {
  /**
   * Reads monotonically increasing wall-clock time.
   *
   * @returns Seconds since an arbitrary but fixed origin.
   */
  nowSeconds(): Seconds;
}

/** Schedules the next frame, and stops. */
export interface FrameScheduler {
  /**
   * Requests one more frame.
   *
   * @param callback - Called once, on the next frame.
   */
  requestFrame(callback: () => void): void;

  /** Cancels any pending frame and stops scheduling. */
  cancel(): void;
}

/** What the engine measured over the last frame. */
export interface FrameStats {
  /** Wall-clock time the frame took, in milliseconds. */
  readonly frameTimeMs: number;
  /** Fixed simulation steps run this frame. */
  readonly steps: number;
  /** Simulated time abandoned to the spiral-of-death guard, in seconds. */
  readonly droppedSeconds: Seconds;
  /** Simulation time, in seconds since J2000. */
  readonly simTimeSeconds: Seconds;
  /** Draw calls issued by the last render. */
  readonly drawCalls: number;
  /** Triangles submitted by the last render. */
  readonly triangles: number;
}

/** Where per-frame diagnostics go. Implemented by the F3 overlay. */
export interface StatsSink {
  /**
   * Publishes the last frame's measurements.
   *
   * Called every frame, so an implementation must not allocate; the overlay
   * writes `textContent` on a throttled tick rather than re-rendering.
   *
   * @param stats - What the frame did.
   */
  publish(stats: FrameStats): void;
}

/** The scene the engine drives. */
export interface SceneRenderer {
  /**
   * Advances anything the scene animates by one fixed step.
   *
   * @param simTimeSeconds - Simulation time after the step.
   */
  step(simTimeSeconds: Seconds): void;

  /**
   * Draws one frame.
   *
   * @param interpolationAlpha - How far between the last step and the next, in [0, 1).
   */
  render(interpolationAlpha: number): void;

  /**
   * Reports what the last render cost.
   *
   * @returns Draw calls and triangles submitted.
   */
  readCounters(): { drawCalls: number; triangles: number };

  /** Releases every GPU resource the scene holds. */
  dispose(): void;
}
