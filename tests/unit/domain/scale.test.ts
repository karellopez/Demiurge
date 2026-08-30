import { describe, expect, it } from 'vitest';

import {
  MAX_DISTANCE_SCALE,
  MAX_SIZE_SCALE,
  MIN_DISTANCE_SCALE,
  MIN_SIZE_SCALE,
  SCALE_PRESETS,
  TRUE_SCALE,
  clampScale,
  interpolateScale,
  isTrueScale,
  presetById,
} from '@domain/scale';

describe('the default', () => {
  it('is true scale, because the honest view is the one you start in', () => {
    expect(TRUE_SCALE).toStrictEqual({ distanceScale: 1, sizeScale: 1 });
    expect(isTrueScale(TRUE_SCALE)).toBe(true);
  });

  it('recognises any exaggeration as not true scale', () => {
    expect(isTrueScale({ distanceScale: 0.5, sizeScale: 1 })).toBe(false);
    expect(isTrueScale({ distanceScale: 1, sizeScale: 2 })).toBe(false);
  });
});

describe('the presets', () => {
  it('offers exactly the three the brief names', () => {
    expect(SCALE_PRESETS.map((preset) => preset.id)).toStrictEqual(['true', 'orrery', 'textbook']);
  });

  it('starts from the honest one', () => {
    expect(SCALE_PRESETS[0]?.settings).toStrictEqual(TRUE_SCALE);
  });

  it('compresses distance and inflates size, never the other way round', () => {
    for (const preset of SCALE_PRESETS) {
      expect(preset.settings.distanceScale).toBeLessThanOrEqual(1);
      expect(preset.settings.sizeScale).toBeGreaterThanOrEqual(1);
    }
  });

  it('exaggerates more with each step away from true', () => {
    const [trueScale, orrery, textbook] = SCALE_PRESETS;
    expect(orrery!.settings.distanceScale).toBeLessThan(trueScale!.settings.distanceScale);
    expect(textbook!.settings.distanceScale).toBeLessThan(orrery!.settings.distanceScale);
    expect(orrery!.settings.sizeScale).toBeGreaterThan(trueScale!.settings.sizeScale);
    expect(textbook!.settings.sizeScale).toBeGreaterThan(orrery!.settings.sizeScale);
  });

  it('keeps every preset inside the offered ranges', () => {
    for (const preset of SCALE_PRESETS) {
      expect(clampScale(preset.settings)).toStrictEqual(preset.settings);
    }
  });

  it('explains each one in a sentence', () => {
    for (const preset of SCALE_PRESETS) {
      expect(preset.description.length).toBeGreaterThan(20);
      expect(preset.label.length).toBeGreaterThan(0);
    }
  });

  it('finds a preset by id', () => {
    expect(presetById('orrery')?.label).toBe('Orrery');
  });

  it('reports nothing for an unknown id', () => {
    expect(presetById('spiral-galaxy')).toBeUndefined();
  });
});

describe('clamping', () => {
  it('accepts settings already in range', () => {
    expect(clampScale({ distanceScale: 0.5, sizeScale: 50 })).toStrictEqual({
      distanceScale: 0.5,
      sizeScale: 50,
    });
  });

  it('refuses to stretch distance past true scale', () => {
    expect(clampScale({ distanceScale: 10, sizeScale: 1 }).distanceScale).toBe(MAX_DISTANCE_SCALE);
  });

  it('refuses to shrink a body below its real size', () => {
    expect(clampScale({ distanceScale: 1, sizeScale: 0.1 }).sizeScale).toBe(MIN_SIZE_SCALE);
  });

  it('holds the floor and the ceiling', () => {
    const low = clampScale({ distanceScale: 0, sizeScale: 0 });
    expect(low.distanceScale).toBe(MIN_DISTANCE_SCALE);
    expect(low.sizeScale).toBe(MIN_SIZE_SCALE);

    const high = clampScale({ distanceScale: 1e9, sizeScale: 1e9 });
    expect(high.distanceScale).toBe(MAX_DISTANCE_SCALE);
    expect(high.sizeScale).toBe(MAX_SIZE_SCALE);
  });

  it('survives a malformed URL rather than showing nothing', () => {
    // A shared link can carry anything. Clamping means a broken one still shows
    // a solar system instead of a blank screen.
    const rescued = clampScale({ distanceScale: NaN, sizeScale: NaN });
    expect(Number.isFinite(rescued.distanceScale)).toBe(true);
    expect(Number.isFinite(rescued.sizeScale)).toBe(true);
  });
});

describe('interpolating between presets', () => {
  const orrery = SCALE_PRESETS[1]!.settings;

  it('is the start at zero and the end at one', () => {
    expect(interpolateScale(TRUE_SCALE, orrery, 0)).toStrictEqual(TRUE_SCALE);
    const finished = interpolateScale(TRUE_SCALE, orrery, 1);
    expect(finished.distanceScale).toBeCloseTo(orrery.distanceScale, 9);
    expect(finished.sizeScale).toBeCloseTo(orrery.sizeScale, 9);
  });

  it('clamps progress rather than overshooting the destination', () => {
    expect(interpolateScale(TRUE_SCALE, orrery, 5).distanceScale).toBeCloseTo(
      orrery.distanceScale,
      9,
    );
    expect(interpolateScale(TRUE_SCALE, orrery, -5).distanceScale).toBeCloseTo(1, 9);
  });

  it('moves geometrically, so the midpoint is a ratio and not an average', () => {
    // Halfway from 1 to 0.01 is 0.1, not 0.505. A linear sweep would look like
    // nothing was happening and then lurch.
    const midpoint = interpolateScale(
      { distanceScale: 1, sizeScale: 1 },
      { distanceScale: 0.01, sizeScale: 100 },
      0.5,
    );
    expect(midpoint.distanceScale).toBeCloseTo(0.1, 9);
    expect(midpoint.sizeScale).toBeCloseTo(10, 9);
  });

  it('stays inside the two endpoints all the way across', () => {
    for (let step = 0; step <= 20; step += 1) {
      const partial = interpolateScale(TRUE_SCALE, orrery, step / 20);
      expect(partial.distanceScale).toBeLessThanOrEqual(1);
      expect(partial.distanceScale).toBeGreaterThanOrEqual(orrery.distanceScale);
      expect(partial.sizeScale).toBeGreaterThanOrEqual(1);
      expect(partial.sizeScale).toBeLessThanOrEqual(orrery.sizeScale);
    }
  });

  it('never leaves the offered ranges partway through', () => {
    for (let step = 0; step <= 20; step += 1) {
      const partial = interpolateScale(TRUE_SCALE, SCALE_PRESETS[2]!.settings, step / 20);
      expect(clampScale(partial)).toStrictEqual(partial);
    }
  });
});

describe('interpolating between two exaggerations', () => {
  it('moves geometrically, so the midpoint is the geometric mean', () => {
    // Linear interpolation between 0.5 and 0.1 would pass through 0.3, which
    // looks like almost no change for the first half of the sweep and then a
    // lurch. The geometric midpoint is sqrt(0.5 * 0.1).
    const half = interpolateScale(
      { distanceScale: 0.5, sizeScale: 4 },
      { distanceScale: 0.1, sizeScale: 100 },
      0.5,
    );
    expect(half.distanceScale).toBeCloseTo(Math.sqrt(0.5 * 0.1), 12);
    expect(half.sizeScale).toBeCloseTo(Math.sqrt(4 * 100), 12);
  });

  it('reaches a quarter of the way in log space at a quarter of the way through', () => {
    const quarter = interpolateScale(
      { distanceScale: 1, sizeScale: 1 },
      { distanceScale: 0.0001, sizeScale: 10_000 },
      0.25,
    );
    expect(quarter.distanceScale).toBeCloseTo(0.1, 12);
    expect(quarter.sizeScale).toBeCloseTo(10, 12);
  });
});
