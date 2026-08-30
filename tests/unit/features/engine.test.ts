import { beforeEach, describe, expect, it } from 'vitest';

import { FIXED_STEP_SECONDS } from '@domain/fixed-step';
import { createEngine, type Engine } from '@features/engine/engine';
import {
  createFakeClock,
  createFakeScheduler,
  createRecordingScene,
  createRecordingStats,
  type FakeClock,
  type FakeScheduler,
  type RecordingScene,
  type RecordingStats,
} from '@tests/fixtures/fake-frame-loop';

let clock: FakeClock;
let scheduler: FakeScheduler;
let scene: RecordingScene;
let stats: RecordingStats;
let engine: Engine;

beforeEach(() => {
  clock = createFakeClock();
  scheduler = createFakeScheduler();
  scene = createRecordingScene();
  stats = createRecordingStats();
  engine = createEngine({ clock, scheduler, scene, stats });
});

/**
 * Advances the clock and runs one frame.
 *
 * @param deltaSeconds - Wall-clock time since the previous frame.
 */
function runFrame(deltaSeconds: number): void {
  clock.advance(deltaSeconds);
  scheduler.runPendingFrame();
}

describe('starting and stopping', () => {
  it('schedules a frame when started', () => {
    expect(scheduler.hasPendingFrame()).toBe(false);
    engine.start();
    expect(scheduler.hasPendingFrame()).toBe(true);
  });

  it('keeps scheduling frames while it runs', () => {
    engine.start();
    runFrame(1 / 60);
    expect(scheduler.hasPendingFrame()).toBe(true);
  });

  it('ignores a second start rather than running two loops', () => {
    engine.start();
    engine.start();
    runFrame(1 / 60);
    expect(scene.renderAlphas).toHaveLength(1);
  });

  it('stops scheduling once stopped', () => {
    engine.start();
    engine.stop();
    expect(scheduler.hasPendingFrame()).toBe(false);
    expect(scheduler.cancelCount()).toBe(1);
  });

  it('releases the scene when stopped', () => {
    engine.start();
    engine.stop();
    expect(scene.disposeCount()).toBe(1);
  });

  it('does not render a frame that arrives after stopping', () => {
    engine.start();
    engine.stop();
    scheduler.runPendingFrame();
    expect(scene.renderAlphas).toHaveLength(0);
  });
});

describe('driving the simulation', () => {
  it('renders once per frame regardless of how many steps ran', () => {
    engine.start();
    runFrame(1 / 60);
    runFrame(1 / 60);
    expect(scene.renderAlphas).toHaveLength(2);
  });

  it('runs two fixed steps for one 60 Hz frame', () => {
    // 120 Hz simulation, 60 Hz display: exactly two steps per frame.
    engine.start();
    runFrame(1 / 60);
    expect(scene.stepTimes).toHaveLength(2);
  });

  it('advances simulation time by the fixed step', () => {
    engine.start();
    runFrame(1 / 60);
    expect(engine.simTimeSeconds()).toBeCloseTo(2 * FIXED_STEP_SECONDS, 12);
  });

  it('runs no steps when the frame was too short to fill one', () => {
    engine.start();
    runFrame(1 / 1000);
    expect(scene.stepTimes).toHaveLength(0);
    expect(scene.renderAlphas).toHaveLength(1);
  });

  it('still renders when no step ran, so motion stays smooth', () => {
    engine.start();
    runFrame(1 / 1000);
    expect(scene.renderAlphas[0]).toBeGreaterThan(0);
  });
});

describe('the time multiplier', () => {
  it('scales how fast simulated time passes', () => {
    engine.start();
    engine.setTimeScale(3600);
    runFrame(1 / 60);
    expect(engine.simTimeSeconds()).toBeCloseTo(2 * FIXED_STEP_SECONDS * 3600, 6);
  });

  it('freezes simulated time when paused, but keeps rendering', () => {
    engine.start();
    engine.setTimeScale(0);
    runFrame(1 / 60);
    expect(engine.simTimeSeconds()).toBe(0);
    expect(scene.renderAlphas).toHaveLength(1);
  });

  it('runs simulated time backwards for a negative multiplier', () => {
    engine.start();
    engine.setTimeScale(-1);
    runFrame(1 / 60);
    expect(engine.simTimeSeconds()).toBeLessThan(0);
  });
});

describe('surviving a stalled tab', () => {
  it('caps the catch-up rather than freezing on a ten-minute gap', () => {
    engine.start();
    runFrame(600);
    expect(scene.stepTimes.length).toBeLessThanOrEqual(5);
  });

  it('reports the simulated time it deliberately abandoned', () => {
    engine.start();
    runFrame(600);
    expect(stats.published[0]!.droppedSeconds).toBeGreaterThan(0);
  });

  it('returns to normal on the very next frame', () => {
    engine.start();
    runFrame(600);
    const stepsBefore = scene.stepTimes.length;
    runFrame(1 / 60);
    expect(scene.stepTimes.length - stepsBefore).toBeLessThanOrEqual(2);
    expect(stats.published[1]!.droppedSeconds).toBe(0);
  });
});

describe('what the overlay is told', () => {
  it('publishes one record per frame', () => {
    engine.start();
    runFrame(1 / 60);
    runFrame(1 / 60);
    expect(stats.published).toHaveLength(2);
  });

  it('reports the renderer counters', () => {
    engine.start();
    runFrame(1 / 60);
    expect(stats.published[0]!.drawCalls).toBe(7);
    expect(stats.published[0]!.triangles).toBe(1234);
  });

  it('reports the steps that ran and the simulation time reached', () => {
    engine.start();
    runFrame(1 / 60);
    expect(stats.published[0]!.steps).toBe(2);
    expect(stats.published[0]!.simTimeSeconds).toBeCloseTo(2 * FIXED_STEP_SECONDS, 12);
  });

  it('reuses one stats object rather than allocating per frame', () => {
    // The engine documents this as a deliberate mutable hot path. A sink that
    // keeps the reference sees every frame change under it, which is exactly
    // why the recording fixture copies.
    let captured: unknown;
    const capturingEngine = createEngine({
      clock,
      scheduler,
      scene,
      stats: {
        publish(frameStats): void {
          captured ??= frameStats;
          expect(frameStats).toBe(captured);
        },
      },
    });
    capturingEngine.start();
    runFrame(1 / 60);
    runFrame(1 / 60);
    expect(captured).toBeDefined();
  });
});
