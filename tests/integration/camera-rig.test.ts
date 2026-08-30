import { beforeEach, describe, expect, it } from 'vitest';

import { createCameraFrame } from '@domain/camera/camera-frame';
import { CameraMode } from '@domain/camera/camera-mode';
import { MAX_TRANSITION_SECONDS } from '@domain/camera/transition';
import { createCameraRig, type CameraRig } from '@features/camera/camera-rig';
import { buildCatalog } from '@features/space/body-catalog';
import type { RawCatalog } from '@features/space/catalog-schema';
import { createSystemState } from '@features/space/propagate-system';
import { distance } from '@shared/math/vec3';
import { seconds } from '@shared/units';

import rawCatalog from '../../data/bodies.json';

/**
 * The camera rig against the real catalogue and the real propagator.
 *
 * Phase 3's acceptance criteria are that every body including the Sun can be
 * followed, that nothing clips and nothing snaps. The first two are arithmetic
 * and are checked exhaustively over all twenty-five bodies; the third is about
 * what happens *between* two states, which is why the frame-by-frame walk below
 * matters more than any single assertion.
 */

const catalog = buildCatalog(rawCatalog as unknown as RawCatalog);
const system = createSystemState(catalog);
system.update(seconds(0));

let rig: CameraRig;

beforeEach(() => {
  rig = createCameraRig({ catalog, positions: system, initialBodyId: 'earth' });
});

/**
 * Snapshots a frame's position, so it survives the next write into that frame.
 *
 * The rig reuses one frame object every call, which is the point of the
 * zero-allocation design and also the reason a test that keeps a reference sees
 * every value change under it.
 *
 * @param frame - The frame to read.
 * @returns A detached copy of its position.
 */
function snapshot(frame: ReturnType<typeof createCameraFrame>): {
  x: number;
  y: number;
  z: number;
} {
  return { x: frame.position.x, y: frame.position.y, z: frame.position.z };
}

/**
 * Measures how far a frame has moved from a snapshot.
 *
 * @param from - The earlier snapshot.
 * @param from.x
 * @param from.y
 * @param from.z
 * @param frame - The frame now.
 * @returns The distance travelled.
 */
function movedSince(
  from: { x: number; y: number; z: number },
  frame: ReturnType<typeof createCameraFrame>,
): number {
  return Math.hypot(
    frame.position.x - from.x,
    frame.position.y - from.y,
    frame.position.z - from.z,
  );
}

/**
 * Runs the rig for a while, as the render loop would.
 *
 * @param frames - How many frames to run.
 * @param deltaSeconds - Wall-clock time per frame.
 * @returns The frame after the last step.
 */
function run(frames: number, deltaSeconds = 1 / 60): ReturnType<typeof createCameraFrame> {
  const frame = createCameraFrame();
  for (let step = 0; step < frames; step += 1) {
    rig.update(frame, seconds(deltaSeconds), step * deltaSeconds);
  }
  return frame;
}

describe('starting up', () => {
  it('follows the body it was told to', () => {
    expect(rig.state().body.id).toBe('earth');
  });

  it('refuses to start on a body that does not exist', () => {
    expect(() => createCameraRig({ catalog, positions: system, initialBodyId: 'vulcan' })).toThrow(
      /no such body/u,
    );
  });

  it('starts in orbit mode', () => {
    expect(rig.state().mode).toBe(CameraMode.Orbit);
  });

  it('arrives already framed rather than flying in from the Sun', () => {
    // Easing in on the first frame would fly the camera across an astronomical
    // unit every time the page loads.
    const first = createCameraFrame();
    rig.update(first, seconds(1 / 60), 0);
    expect(rig.state().isTransitioning).toBe(false);
    expect(distance(first.position, first.target)).toBeGreaterThan(0);
  });
});

describe('every body is followable', () => {
  it('frames all twenty-five, including the Sun', () => {
    for (const body of catalog.all) {
      const local = createCameraRig({ catalog, positions: system, initialBodyId: body.id });
      const frame = createCameraFrame();
      local.update(frame, seconds(1 / 60), 0);

      const separation = distance(frame.position, frame.target);
      expect(Number.isFinite(separation), `${body.name} produced a non-finite frame`).toBe(true);
      expect(separation, `${body.name} clipped its own surface`).toBeGreaterThan(
        body.equatorialRadius,
      );
    }
  });

  it('never clips, at any zoom, on any body', () => {
    for (const body of catalog.all) {
      const local = createCameraRig({ catalog, positions: system, initialBodyId: body.id });
      const frame = createCameraFrame();
      // Zoom all the way in, well past the stop.
      for (let step = 0; step < 120; step += 1) {
        local.zoom(-1);
      }
      local.update(frame, seconds(1 / 60), 0);
      expect(distance(frame.position, frame.target), body.name).toBeGreaterThan(
        body.equatorialRadius,
      );
    }
  });

  it('withholds Sun-relative on the Sun and offers it everywhere else', () => {
    const onSun = createCameraRig({ catalog, positions: system, initialBodyId: 'sun' });
    for (let step = 0; step < 12; step += 1) {
      onSun.cycleMode();
      expect(onSun.state().mode).not.toBe(CameraMode.SunRelative);
    }

    const modes = new Set<CameraMode>();
    for (let step = 0; step < 12; step += 1) {
      rig.cycleMode();
      modes.add(rig.state().mode);
    }
    expect(modes.has(CameraMode.SunRelative)).toBe(true);
  });
});

describe('changing body', () => {
  it('follows the new body once the move finishes', () => {
    rig.select('mars');
    expect(rig.state().body.id).toBe('mars');
  });

  it('ignores a body that does not exist', () => {
    rig.select('vulcan');
    expect(rig.state().body.id).toBe('earth');
  });

  it('ignores reselecting the body already followed', () => {
    run(2);
    rig.select('earth');
    expect(rig.state().isTransitioning).toBe(false);
  });

  it('travels rather than cutting', () => {
    run(2);
    rig.select('neptune');
    expect(rig.state().isTransitioning).toBe(true);
  });

  it('arrives within the maximum duration', () => {
    run(2);
    rig.select('neptune');
    run(Math.ceil(MAX_TRANSITION_SECONDS * 60) + 4);
    expect(rig.state().isTransitioning).toBe(false);
  });

  it('moves smoothly, with no single frame jumping most of the way', () => {
    // This is the "no snapping" criterion, and it can only be seen by watching
    // consecutive frames: a cut shows up as one enormous step among tiny ones.
    run(2);
    const before = createCameraFrame();
    rig.update(before, seconds(1 / 60), 0);

    rig.select('neptune');

    const previous = createCameraFrame();
    const currentFrame = createCameraFrame();
    rig.update(previous, seconds(1 / 60), 0);

    let largestStep = 0;
    let travelled = 0;
    let mark = snapshot(previous);
    for (let step = 0; step < 180; step += 1) {
      rig.update(currentFrame, seconds(1 / 60), step / 60);
      const stepSize = movedSince(mark, currentFrame);
      largestStep = Math.max(largestStep, stepSize);
      travelled += stepSize;
      mark = snapshot(currentFrame);
    }

    expect(travelled).toBeGreaterThan(0);
    // No frame covers more than a tenth of the journey.
    expect(largestStep / travelled).toBeLessThan(0.1);
  });

  it('re-aims from where it actually is when interrupted', () => {
    // Clicking two bodies quickly must not snap back to the first body's
    // position before setting off again. The tell is a discontinuity: one frame
    // that moves the camera far further than the frames on either side of it.
    run(2);
    rig.select('neptune');

    const previous = createCameraFrame();
    const currentFrame = createCameraFrame();
    rig.update(previous, seconds(1 / 60), 0);

    const stepsBefore: number[] = [];
    let mark = snapshot(previous);
    for (let step = 0; step < 20; step += 1) {
      rig.update(currentFrame, seconds(1 / 60), step / 60);
      stepsBefore.push(movedSince(mark, currentFrame));
      mark = snapshot(currentFrame);
    }

    rig.select('mars');
    rig.update(currentFrame, seconds(1 / 60), 0);
    const stepAcrossTheInterruption = movedSince(mark, currentFrame);

    const largestBefore = Math.max(...stepsBefore);
    expect(largestBefore).toBeGreaterThan(0);
    expect(stepAcrossTheInterruption).toBeLessThan(largestBefore * 3);
  });
});

describe('zoom and drag', () => {
  it('pulls back and moves in', () => {
    const start = rig.state().distanceRadii;
    rig.zoom(2);
    expect(rig.state().distanceRadii).toBeGreaterThan(start);
    rig.zoom(-4);
    expect(rig.state().distanceRadii).toBeLessThan(start);
  });

  it('resets the framing when a new body is selected', () => {
    rig.zoom(10);
    rig.select('mars');
    expect(rig.state().distanceRadii).toBe(30);
  });

  it('turns the view around the body', () => {
    const before = run(2);
    rig.orbitBy(Math.PI / 2, 0);
    const after = run(2);
    expect(distance(before.position, after.position)).toBeGreaterThan(0);
  });

  it('cannot be dragged over the pole into a flip', () => {
    for (let step = 0; step < 50; step += 1) {
      rig.orbitBy(0, 0.5);
    }
    const frame = run(2);
    expect(Number.isFinite(frame.up.x + frame.up.y + frame.up.z)).toBe(true);
    expect(Math.hypot(frame.up.x, frame.up.y, frame.up.z)).toBeCloseTo(1, 6);
  });
});

describe('walking the catalogue', () => {
  const order = catalog.inTreeOrder.map((body) => body.id);

  it('steps forward in the order the list shows, so Earth leads to its moon', () => {
    const rig = createCameraRig({ catalog, positions: system, initialBodyId: 'earth' });
    rig.cycleBody(1);
    expect(rig.state().body.id).toBe('moon');
    expect(order[order.indexOf('earth') + 1]).toBe('moon');
  });

  it('steps back', () => {
    const rig = createCameraRig({ catalog, positions: system, initialBodyId: 'moon' });
    rig.cycleBody(-1);
    expect(rig.state().body.id).toBe('earth');
  });

  it('wraps at the end rather than dead-ending', () => {
    const last = catalog.inTreeOrder.at(-1)!;
    const rig = createCameraRig({ catalog, positions: system, initialBodyId: last.id });
    rig.cycleBody(1);
    expect(rig.state().body.id).toBe(catalog.root.id);
  });

  it('wraps at the start', () => {
    const rig = createCameraRig({ catalog, positions: system, initialBodyId: catalog.root.id });
    rig.cycleBody(-1);
    expect(rig.state().body.id).toBe(catalog.inTreeOrder.at(-1)!.id);
  });

  it('returns to where it started after a full lap', () => {
    const rig = createCameraRig({ catalog, positions: system, initialBodyId: 'earth' });
    rig.cycleBody(catalog.inTreeOrder.length);
    expect(rig.state().body.id).toBe('earth');
  });

  it('travels rather than cutting, the same as a click does', () => {
    const rig = createCameraRig({ catalog, positions: system, initialBodyId: 'earth' });
    rig.update(createCameraFrame(), seconds(0), 0);
    rig.cycleBody(1);
    expect(rig.state().isTransitioning).toBe(true);
  });
});
