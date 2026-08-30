/**
 * The engine loop: a fixed-step simulation driving a variable-step render.
 *
 * All of the timing *policy* lives in `domain/fixed-step.ts`, which is pure and
 * exhaustively tested. This file is the part that cannot be pure — it holds the
 * mutable accumulator, asks the scheduler for frames, and hands measurements to
 * the overlay. Keeping the split that way means the spiral-of-death guard is
 * verified by unit tests rather than by watching a tab lock up.
 *
 * Nothing in the frame path allocates. The stats record is a single object
 * created once and mutated in place; that is the one documented exception to the
 * project's immutability rule, and it is here because publishing a fresh object
 * sixty times a second is a measurable amount of garbage.
 *
 * @module
 */

import { advanceSimTime, planSteps } from '@domain/fixed-step';
import { seconds, type Seconds } from '@shared/units';

import type { Clock, FrameScheduler, FrameStats, SceneRenderer, StatsSink } from './ports';

/** Everything the engine needs, injected by the composition root. */
export interface EngineDependencies {
  readonly clock: Clock;
  readonly scheduler: FrameScheduler;
  readonly scene: SceneRenderer;
  readonly stats: StatsSink;
}

/** A running engine. */
export interface Engine {
  /** Starts the loop. Safe to call twice; the second call does nothing. */
  start(): void;
  /** Stops the loop and releases the scene. */
  stop(): void;
  /**
   * Sets the time multiplier.
   *
   * @param timeScale - 0 pauses; negative values run time backwards.
   */
  setTimeScale(timeScale: number): void;
  /**
   * Reads simulation time.
   *
   * @returns Seconds since J2000.
   */
  simTimeSeconds(): Seconds;
}

/**
 * The engine's mutable per-frame state.
 *
 * PERF: mutable for zero-alloc — every field here is rewritten each frame, and
 * `stats` is published as-is rather than copied, so a fresh object would be
 * roughly sixty allocations a second for no benefit.
 */
interface EngineState {
  isRunning: boolean;
  timeScale: number;
  simTime: Seconds;
  carry: Seconds;
  previousFrameSeconds: Seconds;
  readonly stats: {
    frameTimeMs: number;
    steps: number;
    droppedSeconds: Seconds;
    simTimeSeconds: Seconds;
    drawCalls: number;
    triangles: number;
  };
}

/**
 * Creates the engine's initial state.
 *
 * @param nowSeconds - The clock's current reading.
 * @returns Fresh state, not yet running.
 */
function createEngineState(nowSeconds: Seconds): EngineState {
  return {
    isRunning: false,
    timeScale: 1,
    simTime: seconds(0),
    carry: seconds(0),
    previousFrameSeconds: nowSeconds,
    stats: {
      frameTimeMs: 0,
      steps: 0,
      droppedSeconds: seconds(0),
      simTimeSeconds: seconds(0),
      drawCalls: 0,
      triangles: 0,
    },
  };
}

/**
 * Runs one frame: catch the simulation up, draw, then measure.
 *
 * @param state - The engine's mutable state, advanced in place.
 * @param dependencies - The clock, scene and stats sink.
 */
function runOneFrame(state: EngineState, dependencies: EngineDependencies): void {
  const { clock, scene, stats } = dependencies;

  const frameStartSeconds = clock.nowSeconds();
  const frameDeltaSeconds = seconds(frameStartSeconds - state.previousFrameSeconds);
  state.previousFrameSeconds = frameStartSeconds;

  const plan = planSteps({ carrySeconds: state.carry, frameDeltaSeconds });
  state.carry = plan.carrySeconds;

  for (let step = 0; step < plan.steps; step += 1) {
    state.simTime = advanceSimTime(state.simTime, 1, state.timeScale);
    scene.step(state.simTime);
  }

  scene.render(plan.interpolationAlpha);

  const counters = scene.readCounters();
  state.stats.frameTimeMs = (clock.nowSeconds() - frameStartSeconds) * 1000;
  state.stats.steps = plan.steps;
  state.stats.droppedSeconds = plan.droppedSeconds;
  state.stats.simTimeSeconds = state.simTime;
  state.stats.drawCalls = counters.drawCalls;
  state.stats.triangles = counters.triangles;
  stats.publish(state.stats satisfies FrameStats);
}

/**
 * Creates the engine.
 *
 * @param dependencies - The clock, scheduler, scene and stats sink.
 * @returns An engine, not yet started.
 */
export function createEngine(dependencies: EngineDependencies): Engine {
  const { clock, scheduler, scene } = dependencies;
  const state = createEngineState(clock.nowSeconds());

  const runFrame = (): void => {
    if (!state.isRunning) {
      return;
    }
    runOneFrame(state, dependencies);
    scheduler.requestFrame(runFrame);
  };

  return {
    start(): void {
      if (state.isRunning) {
        return;
      }
      state.isRunning = true;
      state.previousFrameSeconds = clock.nowSeconds();
      scheduler.requestFrame(runFrame);
    },

    stop(): void {
      state.isRunning = false;
      scheduler.cancel();
      scene.dispose();
    },

    setTimeScale(nextTimeScale: number): void {
      state.timeScale = nextTimeScale;
    },

    simTimeSeconds(): Seconds {
      return state.simTime;
    },
  };
}
