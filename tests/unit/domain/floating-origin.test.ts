import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  canRenderAsGeometry,
  float32ResolutionAt,
  toRenderSpace,
  toRenderSpaceFloat32,
  toWorldSpace,
} from '@domain/floating-origin';
import { createVec3, distance, isApproximately, set } from '@shared/math/vec3';

/** Neptune's approximate heliocentric distance, in metres. */
const NEPTUNE_DISTANCE_METERS = 4.5e12;

/** One astronomical unit, in metres. */
const ONE_AU_METERS = 149_597_870_700;

/** The precision the brief requires of the round trip. */
const ONE_MILLIMETER = 0.001;

describe('why the floating origin is necessary', () => {
  it('shows that f32 cannot express a metre at one astronomical unit', () => {
    expect(float32ResolutionAt(ONE_AU_METERS)).toBeGreaterThan(1000);
  });

  it('shows that f32 cannot express a kilometre at Neptune', () => {
    expect(float32ResolutionAt(NEPTUNE_DISTANCE_METERS)).toBeGreaterThan(1000);
  });

  it('shows that f32 expresses a millimetre comfortably near the origin', () => {
    expect(float32ResolutionAt(100)).toBeLessThan(ONE_MILLIMETER);
  });

  it('has a defined resolution at zero rather than dividing by it', () => {
    expect(float32ResolutionAt(0)).toBeGreaterThan(0);
  });

  it('is symmetric about zero', () => {
    expect(float32ResolutionAt(-ONE_AU_METERS)).toBe(float32ResolutionAt(ONE_AU_METERS));
  });
});

describe('the round trip', () => {
  it('recovers a point at Neptune to within a millimetre', () => {
    // The camera is a kilometre from the point, which is the only situation in
    // which metre-scale detail is visible at all.
    const world = createVec3(NEPTUNE_DISTANCE_METERS, 1.2e11, -3.4e10);
    const origin = createVec3(NEPTUNE_DISTANCE_METERS - 1000, 1.2e11 + 250, -3.4e10 - 40);

    const render = toRenderSpaceFloat32(createVec3(), world, origin);
    const recovered = toWorldSpace(createVec3(), render, origin);

    expect(distance(recovered, world)).toBeLessThan(ONE_MILLIMETER);
  });

  it('recovers a point at one astronomical unit to within a millimetre', () => {
    const world = createVec3(ONE_AU_METERS, 0, 0);
    const origin = createVec3(ONE_AU_METERS - 500, -120, 75);

    const render = toRenderSpaceFloat32(createVec3(), world, origin);
    const recovered = toWorldSpace(createVec3(), render, origin);

    expect(distance(recovered, world)).toBeLessThan(ONE_MILLIMETER);
  });

  it('is exact in f64 before the cast', () => {
    const world = createVec3(NEPTUNE_DISTANCE_METERS, 0, 0);
    const origin = createVec3(NEPTUNE_DISTANCE_METERS - 1, 0, 0);
    expect(toRenderSpace(createVec3(), world, origin).x).toBe(1);
  });

  it('round-trips at any camera offset up to a kilometre', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1000, max: 1000, noNaN: true }),
        fc.double({ min: -1000, max: 1000, noNaN: true }),
        fc.double({ min: -1000, max: 1000, noNaN: true }),
        (dx, dy, dz) => {
          const world = createVec3(NEPTUNE_DISTANCE_METERS, 1e11, -2e10);
          const origin = createVec3(world.x + dx, world.y + dy, world.z + dz);
          const render = toRenderSpaceFloat32(createVec3(), world, origin);
          const recovered = toWorldSpace(createVec3(), render, origin);
          expect(isApproximately(recovered, world, ONE_MILLIMETER)).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('no jitter under camera motion', () => {
  it('moves a distant point smoothly as the camera creeps forward', () => {
    // Walking at a centimetre per frame at Neptune's distance. Without the
    // floating origin every one of these frames would quantise to the same f32
    // and the point would sit still, then leap several hundred kilometres.
    const world = createVec3(NEPTUNE_DISTANCE_METERS, 0, 0);
    const origin = createVec3(NEPTUNE_DISTANCE_METERS - 100, 0, 0);
    const render = createVec3();
    const seen: number[] = [];

    for (let frame = 0; frame < 20; frame += 1) {
      set(origin, NEPTUNE_DISTANCE_METERS - 100 + frame * 0.01, 0, 0);
      toRenderSpaceFloat32(render, world, origin);
      seen.push(render.x);
    }

    // Strictly decreasing: every frame of camera motion moved the point.
    for (let index = 1; index < seen.length; index += 1) {
      expect(seen[index]!).toBeLessThan(seen[index - 1]!);
    }
    // And each step is the centimetre we asked for, not a 500 km snap.
    expect(seen[0]! - seen.at(-1)!).toBeCloseTo(0.19, 3);
  });
});

describe('deciding between geometry and an impostor', () => {
  it('draws real geometry for a metre-scale feature near the camera', () => {
    expect(canRenderAsGeometry(5000, 1)).toBe(true);
  });

  it('refuses real geometry for a metre-scale feature at Neptune', () => {
    expect(canRenderAsGeometry(NEPTUNE_DISTANCE_METERS, 1)).toBe(false);
  });

  it('allows coarse geometry further out than fine geometry', () => {
    expect(canRenderAsGeometry(1e9, 1)).toBe(false);
    expect(canRenderAsGeometry(1e9, 1000)).toBe(true);
  });
});

describe('the geometry threshold is inclusive', () => {
  it('accepts detail exactly equal to the f32 resolution at that distance', () => {
    const resolution = float32ResolutionAt(1e9);
    expect(canRenderAsGeometry(1e9, resolution)).toBe(true);
  });

  it('rejects detail one step finer than the resolution', () => {
    const resolution = float32ResolutionAt(1e9);
    expect(canRenderAsGeometry(1e9, resolution / 2)).toBe(false);
  });
});
