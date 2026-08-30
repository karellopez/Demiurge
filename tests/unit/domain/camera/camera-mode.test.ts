import { describe, expect, it } from 'vitest';

import {
  CAMERA_MODE_LABELS,
  CAMERA_MODE_ORDER,
  CameraMode,
  isModeAvailable,
  nextAvailableCameraMode,
  nextCameraMode,
} from '@domain/camera/camera-mode';

describe('the cycle', () => {
  it('starts at orbit, which is the mode every 3D viewer has taught', () => {
    expect(CAMERA_MODE_ORDER[0]).toBe(CameraMode.Orbit);
  });

  it('covers every mode exactly once', () => {
    expect(new Set(CAMERA_MODE_ORDER).size).toBe(CAMERA_MODE_ORDER.length);
    expect(CAMERA_MODE_ORDER).toHaveLength(Object.keys(CAMERA_MODE_LABELS).length);
  });

  it('wraps back to the start', () => {
    let mode = CameraMode.Orbit;
    for (const unused of CAMERA_MODE_ORDER) {
      expect(unused).toBeDefined();
      mode = nextCameraMode(mode);
    }
    expect(mode).toBe(CameraMode.Orbit);
  });

  it('visits every mode before repeating', () => {
    const seen = new Set<CameraMode>();
    let mode = CameraMode.Orbit;
    for (const step of CAMERA_MODE_ORDER) {
      expect(step).toBeDefined();
      seen.add(mode);
      mode = nextCameraMode(mode);
    }
    expect(seen.size).toBe(CAMERA_MODE_ORDER.length);
  });

  it('labels every mode in plain nouns', () => {
    for (const mode of CAMERA_MODE_ORDER) {
      expect(CAMERA_MODE_LABELS[mode].length).toBeGreaterThan(0);
    }
  });
});

describe('modes that make no sense for the body being followed', () => {
  it('offers every mode for a planet', () => {
    for (const mode of CAMERA_MODE_ORDER) {
      expect(isModeAvailable(mode, false)).toBe(true);
    }
  });

  it('withholds Sun-relative when the Sun is the body being followed', () => {
    // There is no terminator on a star, and the direction to the Sun is
    // undefined at its own centre.
    expect(isModeAvailable(CameraMode.SunRelative, true)).toBe(false);
  });

  it('offers every other mode on the Sun', () => {
    for (const mode of CAMERA_MODE_ORDER) {
      if (mode === CameraMode.SunRelative) {
        continue;
      }
      expect(isModeAvailable(mode, true)).toBe(true);
    }
  });

  it('skips the unavailable mode when cycling rather than showing a dead one', () => {
    expect(nextAvailableCameraMode(CameraMode.Inertial, true)).toBe(CameraMode.Cinematic);
  });

  it('still cycles through everything on a planet', () => {
    expect(nextAvailableCameraMode(CameraMode.Inertial, false)).toBe(CameraMode.SunRelative);
  });

  it('always lands on an available mode, from anywhere, on either kind of body', () => {
    for (const isStar of [true, false]) {
      for (const mode of CAMERA_MODE_ORDER) {
        expect(isModeAvailable(nextAvailableCameraMode(mode, isStar), isStar)).toBe(true);
      }
    }
  });
});
