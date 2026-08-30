import { describe, expect, it } from 'vitest';

import { FIXED_STEP_SECONDS, MAX_SUBSTEPS, advanceSimTime, planSteps } from '@domain/fixed-step';
import { seconds } from '@shared/units';

/** A round timestep, so the arithmetic in these tests reads clearly. */
const TENTH = seconds(0.1);

describe('the fixed timestep', () => {
  it('runs the simulation at 120 Hz', () => {
    expect(FIXED_STEP_SECONDS).toBeCloseTo(1 / 120, 12);
  });
});

describe('planning a frame', () => {
  it('runs no steps when not enough time has passed', () => {
    const plan = planSteps({
      carrySeconds: seconds(0),
      frameDeltaSeconds: seconds(0.05),
      fixedStepSeconds: TENTH,
    });
    expect(plan.steps).toBe(0);
    expect(plan.carrySeconds).toBeCloseTo(0.05, 12);
  });

  it('runs one step for exactly one step of time', () => {
    const plan = planSteps({
      carrySeconds: seconds(0),
      frameDeltaSeconds: TENTH,
      fixedStepSeconds: TENTH,
    });
    expect(plan.steps).toBe(1);
    expect(plan.carrySeconds).toBeCloseTo(0, 12);
  });

  it('carries the remainder into the next frame', () => {
    const plan = planSteps({
      carrySeconds: seconds(0),
      frameDeltaSeconds: seconds(0.25),
      fixedStepSeconds: TENTH,
    });
    expect(plan.steps).toBe(2);
    expect(plan.carrySeconds).toBeCloseTo(0.05, 12);
  });

  it('spends time carried from the previous frame', () => {
    const plan = planSteps({
      carrySeconds: seconds(0.09),
      frameDeltaSeconds: seconds(0.02),
      fixedStepSeconds: TENTH,
    });
    expect(plan.steps).toBe(1);
    expect(plan.carrySeconds).toBeCloseTo(0.01, 12);
  });

  it('reports how far to interpolate the render between steps', () => {
    const plan = planSteps({
      carrySeconds: seconds(0),
      frameDeltaSeconds: seconds(0.15),
      fixedStepSeconds: TENTH,
    });
    expect(plan.steps).toBe(1);
    expect(plan.interpolationAlpha).toBeCloseTo(0.5, 12);
  });

  it('keeps the interpolation parameter inside the unit interval', () => {
    for (const delta of [0, 0.001, 0.033, 0.099, 0.1, 0.2, 10]) {
      const plan = planSteps({
        carrySeconds: seconds(0),
        frameDeltaSeconds: seconds(delta),
        fixedStepSeconds: TENTH,
      });
      expect(plan.interpolationAlpha).toBeGreaterThanOrEqual(0);
      expect(plan.interpolationAlpha).toBeLessThan(1);
    }
  });
});

describe('the spiral-of-death guard', () => {
  it('never runs more than the substep cap', () => {
    const plan = planSteps({
      carrySeconds: seconds(0),
      frameDeltaSeconds: seconds(10),
      fixedStepSeconds: TENTH,
      maxSubsteps: 5,
    });
    expect(plan.steps).toBe(5);
  });

  it('discards the debt it cannot repay rather than carrying it', () => {
    const plan = planSteps({
      carrySeconds: seconds(0),
      frameDeltaSeconds: seconds(10),
      fixedStepSeconds: TENTH,
      maxSubsteps: 5,
    });
    expect(plan.droppedSeconds).toBeGreaterThan(0);
    expect(plan.carrySeconds).toBeLessThan(TENTH);
  });

  it('recovers on the very next frame instead of compounding', () => {
    // A tab restored after a long pause must not leave the loop permanently
    // behind. One catastrophic frame, then normal service.
    const stalled = planSteps({
      carrySeconds: seconds(0),
      frameDeltaSeconds: seconds(600),
      fixedStepSeconds: TENTH,
      maxSubsteps: 5,
    });
    const next = planSteps({
      carrySeconds: stalled.carrySeconds,
      frameDeltaSeconds: seconds(1 / 60),
      fixedStepSeconds: TENTH,
      maxSubsteps: 5,
    });
    expect(next.steps).toBeLessThanOrEqual(1);
    expect(next.droppedSeconds).toBe(0);
  });

  it('drops nothing when the frame is inside the cap', () => {
    const plan = planSteps({
      carrySeconds: seconds(0),
      frameDeltaSeconds: seconds(0.25),
      fixedStepSeconds: TENTH,
      maxSubsteps: 5,
    });
    expect(plan.droppedSeconds).toBe(0);
  });

  it('defaults to the documented substep cap', () => {
    const plan = planSteps({
      carrySeconds: seconds(0),
      frameDeltaSeconds: seconds(10),
    });
    expect(plan.steps).toBe(MAX_SUBSTEPS);
  });
});

describe('hostile clocks', () => {
  it('treats a backwards clock as a stalled frame rather than rewinding', () => {
    const plan = planSteps({
      carrySeconds: seconds(0.05),
      frameDeltaSeconds: seconds(-3),
      fixedStepSeconds: TENTH,
    });
    expect(plan.steps).toBe(0);
    expect(plan.carrySeconds).toBeCloseTo(0.05, 12);
  });

  it('survives an enormous delta without running thousands of substeps', () => {
    const plan = planSteps({
      carrySeconds: seconds(0),
      frameDeltaSeconds: seconds(600),
      fixedStepSeconds: seconds(1 / 120),
    });
    expect(plan.steps).toBe(MAX_SUBSTEPS);
    expect(plan.carrySeconds).toBeLessThan(1 / 120);
  });
});

describe('frame-rate independence', () => {
  it('reaches the same simulated time at 60 Hz and at 144 Hz', () => {
    const runAt = (frameRate: number, frames: number): number => {
      let carry = seconds(0);
      let steps = 0;
      for (let frame = 0; frame < frames; frame += 1) {
        const plan = planSteps({
          carrySeconds: carry,
          frameDeltaSeconds: seconds(1 / frameRate),
        });
        carry = plan.carrySeconds;
        steps += plan.steps;
      }
      return steps * FIXED_STEP_SECONDS;
    };

    // Two seconds of wall clock at each refresh rate. The two need not land on
    // exactly the same simulated time: at any instant the accumulator may be
    // holding up to one unspent step. Agreeing to inside one step is precisely
    // the frame-rate independence guarantee, and asserting more than that would
    // be asserting something the design does not promise.
    const atSixty = runAt(60, 120);
    const atOneFortyFour = runAt(144, 288);
    expect(Math.abs(atSixty - atOneFortyFour)).toBeLessThan(FIXED_STEP_SECONDS);
    // And both track the two seconds of wall clock to within that same step.
    expect(Math.abs(atSixty - 2)).toBeLessThan(FIXED_STEP_SECONDS);
    expect(Math.abs(atOneFortyFour - 2)).toBeLessThan(FIXED_STEP_SECONDS);
  });
});

describe('advancing simulation time', () => {
  it('advances by the fixed step times the multiplier', () => {
    expect(advanceSimTime(seconds(0), 120, 1)).toBeCloseTo(1, 9);
  });

  it('honours a time multiplier', () => {
    expect(advanceSimTime(seconds(0), 120, 3600)).toBeCloseTo(3600, 6);
  });

  it('runs time backwards for a negative multiplier', () => {
    expect(advanceSimTime(seconds(1000), 120, -1)).toBeCloseTo(999, 9);
  });

  it('stands still when paused', () => {
    expect(advanceSimTime(seconds(1000), 120, 0)).toBe(1000);
  });
});

describe('exactly how much time is abandoned', () => {
  it('drops everything beyond what the cap could run, to the step', () => {
    // 10 s available, 0.1 s steps, 5 substeps: 0.5 s is run, 9.5 s is abandoned,
    // and nothing is carried because 10 divides evenly into the step.
    const plan = planSteps({
      carrySeconds: seconds(0),
      frameDeltaSeconds: seconds(10),
      fixedStepSeconds: TENTH,
      maxSubsteps: 5,
    });
    expect(plan.steps).toBe(5);
    expect(plan.droppedSeconds).toBeCloseTo(9.5, 9);
    expect(plan.carrySeconds).toBeCloseTo(0, 9);
  });

  it('carries the sub-step remainder and drops only whole steps', () => {
    // 10.04 s: five steps run (0.5 s), 9.5 s abandoned, 0.04 s carried.
    const plan = planSteps({
      carrySeconds: seconds(0),
      frameDeltaSeconds: seconds(10.04),
      fixedStepSeconds: TENTH,
      maxSubsteps: 5,
    });
    expect(plan.droppedSeconds).toBeCloseTo(9.5, 9);
    expect(plan.carrySeconds).toBeCloseTo(0.04, 9);
  });

  it('accounts for every second: run plus dropped plus carried equals available', () => {
    const available = 7.37;
    const plan = planSteps({
      carrySeconds: seconds(0),
      frameDeltaSeconds: seconds(available),
      fixedStepSeconds: TENTH,
      maxSubsteps: 5,
    });
    const consumed = plan.steps * TENTH;
    expect(consumed + plan.droppedSeconds + plan.carrySeconds).toBeCloseTo(available, 9);
  });

  it('runs exactly the cap, not one more, at the boundary', () => {
    // Exactly five steps of time: the cap is reached but not exceeded, so
    // nothing may be dropped.
    const plan = planSteps({
      carrySeconds: seconds(0),
      frameDeltaSeconds: seconds(0.5),
      fixedStepSeconds: TENTH,
      maxSubsteps: 5,
    });
    expect(plan.steps).toBe(5);
    expect(plan.droppedSeconds).toBe(0);
  });

  it('drops as soon as more than the cap is owed', () => {
    // 0.65 s owes six steps against a cap of five, so one whole step is
    // abandoned and the half-step remainder is carried.
    const plan = planSteps({
      carrySeconds: seconds(0),
      frameDeltaSeconds: seconds(0.65),
      fixedStepSeconds: TENTH,
      maxSubsteps: 5,
    });
    expect(plan.steps).toBe(5);
    expect(plan.droppedSeconds).toBeCloseTo(0.1, 9);
    expect(plan.carrySeconds).toBeCloseTo(0.05, 9);
  });

  it('defers rather than drops when the shortfall is a rounding artefact', () => {
    // `0.6 / 0.1` is 5.999... in binary floating point, so only five steps are
    // owed and none is abandoned. The sixth simply runs on the next frame, which
    // is why this is a deferral and not lost time.
    const plan = planSteps({
      carrySeconds: seconds(0),
      frameDeltaSeconds: seconds(0.6),
      fixedStepSeconds: TENTH,
      maxSubsteps: 5,
    });
    expect(plan.steps).toBe(5);
    expect(plan.droppedSeconds).toBe(0);
    expect(plan.carrySeconds).toBeCloseTo(0.1, 9);
  });
});
