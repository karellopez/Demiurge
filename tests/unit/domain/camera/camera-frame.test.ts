import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ORBIT_RADII,
  MAX_ORBIT_RADII,
  MIN_ORBIT_RADII,
  clampElevation,
  clampOrbitDistance,
  copyCameraFrame,
  createCameraFrame,
  createCameraFramer,
  lerpCameraFrame,
  zoomOrbitDistance,
  type CameraFrameInput,
} from '@domain/camera/camera-frame';
import { CameraMode } from '@domain/camera/camera-mode';
import { createVec3, distance, length, type Vec3 } from '@shared/math/vec3';
import { meters, radians } from '@shared/units';

/** Earth's equatorial radius, as a stand-in for "a normal planet". */
const EARTH_RADIUS = meters(6_378_137);

/**
 * Builds frame inputs, overriding only what a test is about.
 *
 * @param overrides - The inputs under test.
 * @returns Complete inputs: Earth-sized body at the origin, star along +x.
 */
function anInput(overrides: Partial<CameraFrameInput> = {}): CameraFrameInput {
  return {
    mode: CameraMode.Orbit,
    bodyPosition: createVec3(0, 0, 0),
    starPosition: createVec3(1.5e11, 0, 0),
    bodyRadius: EARTH_RADIUS,
    distanceRadii: DEFAULT_ORBIT_RADII,
    azimuth: radians(0),
    elevation: radians(0),
    bodyRotation: radians(0),
    wallClockSeconds: 0,
    ...overrides,
  };
}

describe('the orbit distance', () => {
  it('starts far enough out to frame a body', () => {
    expect(DEFAULT_ORBIT_RADII).toBe(30);
  });

  it('never comes closer than just above the surface', () => {
    expect(clampOrbitDistance(0)).toBe(MIN_ORBIT_RADII);
    expect(clampOrbitDistance(-100)).toBe(MIN_ORBIT_RADII);
    expect(MIN_ORBIT_RADII).toBeGreaterThan(1);
  });

  it('never pulls back past the ceiling', () => {
    expect(clampOrbitDistance(1e9)).toBe(MAX_ORBIT_RADII);
  });

  it('falls back to the default for a corrupted value', () => {
    expect(clampOrbitDistance(NaN)).toBe(DEFAULT_ORBIT_RADII);
  });
});

describe('zooming', () => {
  it('pulls back on a positive notch and moves in on a negative one', () => {
    expect(zoomOrbitDistance(100, 1)).toBeGreaterThan(100);
    expect(zoomOrbitDistance(100, -1)).toBeLessThan(100);
  });

  it('is exponential, so one notch means the same at every distance', () => {
    // The ratio, not the difference, is what stays constant. A linear step that
    // feels right at eight radii is imperceptible at eight thousand.
    const nearRatio = zoomOrbitDistance(10, 1) / 10;
    const farRatio = zoomOrbitDistance(1000, 1) / 1000;
    expect(nearRatio).toBeCloseTo(farRatio, 9);
  });

  it('is reversible', () => {
    expect(zoomOrbitDistance(zoomOrbitDistance(100, 3), -3)).toBeCloseTo(100, 6);
  });

  it('cannot be zoomed into the surface, however hard you try', () => {
    let value = DEFAULT_ORBIT_RADII;
    for (let step = 0; step < 200; step += 1) {
      value = zoomOrbitDistance(value, -1);
    }
    expect(value).toBe(MIN_ORBIT_RADII);
  });

  it('cannot be zoomed out past the ceiling', () => {
    let value = DEFAULT_ORBIT_RADII;
    for (let step = 0; step < 200; step += 1) {
      value = zoomOrbitDistance(value, 1);
    }
    expect(value).toBe(MAX_ORBIT_RADII);
  });
});

describe('elevation', () => {
  it('stops just short of the poles, where the basis would collapse', () => {
    expect(clampElevation(Math.PI)).toBeLessThan(Math.PI / 2);
    expect(clampElevation(-Math.PI)).toBeGreaterThan(-Math.PI / 2);
  });

  it('leaves an ordinary elevation alone', () => {
    expect(clampElevation(0.4)).toBeCloseTo(0.4, 12);
  });

  it('recovers from a corrupted value', () => {
    expect(clampElevation(NaN)).toBe(0);
  });
});

describe('placing the camera', () => {
  const framer = createCameraFramer();

  it('always looks at the body it is following', () => {
    const frame = framer.compute(
      createCameraFrame(),
      anInput({
        bodyPosition: createVec3(3, 4, 5),
      }),
    );
    expect([frame.target.x, frame.target.y, frame.target.z]).toStrictEqual([3, 4, 5]);
  });

  it('sits exactly the requested number of radii away', () => {
    const frame = framer.compute(createCameraFrame(), anInput({ distanceRadii: 12 }));
    expect(distance(frame.position, frame.target)).toBeCloseTo(EARTH_RADIUS * 12, 3);
  });

  it('never sits inside the body, at any requested distance', () => {
    for (const distanceRadii of [-1000, 0, 0.5, 1, 1.0001, NaN]) {
      const frame = framer.compute(createCameraFrame(), anInput({ distanceRadii }));
      expect(
        distance(frame.position, frame.target),
        `distance ${String(distanceRadii)} clipped the surface`,
      ).toBeGreaterThan(EARTH_RADIUS);
    }
  });

  it('scales with the body, so one number frames Phobos and Jupiter alike', () => {
    const phobos = framer.compute(createCameraFrame(), anInput({ bodyRadius: meters(11_267) }));
    const jupiter = framer.compute(
      createCameraFrame(),
      anInput({ bodyRadius: meters(71_492_000) }),
    );
    const phobosRadii = distance(phobos.position, phobos.target) / 11_267;
    const jupiterRadii = distance(jupiter.position, jupiter.target) / 71_492_000;
    expect(phobosRadii).toBeCloseTo(jupiterRadii, 6);
  });

  it('moves round the body as the azimuth turns', () => {
    const first = framer.compute(createCameraFrame(), anInput({ azimuth: radians(0) }));
    const quarter = framer.compute(createCameraFrame(), anInput({ azimuth: radians(Math.PI / 2) }));
    expect(first.position.x).toBeGreaterThan(0);
    expect(quarter.position.y).toBeGreaterThan(0);
    expect(Math.abs(quarter.position.x)).toBeLessThan(Math.abs(first.position.x) * 0.01);
  });

  it('rises out of the ecliptic as the elevation grows', () => {
    const level = framer.compute(createCameraFrame(), anInput({ elevation: radians(0) }));
    const raised = framer.compute(createCameraFrame(), anInput({ elevation: radians(0.8) }));
    expect(Math.abs(level.position.z)).toBeLessThan(1);
    expect(raised.position.z).toBeGreaterThan(0);
  });

  it('always writes a unit up vector', () => {
    for (const elevation of [-1.5, -0.5, 0, 0.5, 1.5]) {
      const frame = framer.compute(createCameraFrame(), anInput({ elevation: radians(elevation) }));
      expect(length(frame.up)).toBeCloseTo(1, 9);
    }
  });

  it('does not let the up vector collapse when looking down a pole', () => {
    // At the pole the view direction and ecliptic north are parallel, and a
    // naive up vector becomes zero. This is where the roll would snap.
    const frame = framer.compute(createCameraFrame(), anInput({ elevation: radians(Math.PI / 2) }));
    expect(length(frame.up)).toBeCloseTo(1, 9);
    expect(Number.isFinite(frame.up.x + frame.up.y + frame.up.z)).toBe(true);
  });
});

describe('what each mode holds still', () => {
  const framer = createCameraFramer();

  it('leaves the orbit camera free of the body spin', () => {
    const still = framer.compute(
      createCameraFrame(),
      anInput({ mode: CameraMode.Orbit, bodyRotation: radians(0) }),
    );
    const spun = framer.compute(
      createCameraFrame(),
      anInput({ mode: CameraMode.Orbit, bodyRotation: radians(2) }),
    );
    expect(spun.position.x).toBeCloseTo(still.position.x, 6);
  });

  it('carries the locked camera round with the body spin', () => {
    const still = framer.compute(
      createCameraFrame(),
      anInput({ mode: CameraMode.Locked, bodyRotation: radians(0) }),
    );
    const spun = framer.compute(
      createCameraFrame(),
      anInput({ mode: CameraMode.Locked, bodyRotation: radians(Math.PI / 2) }),
    );
    expect(spun.position.y).toBeGreaterThan(0);
    expect(still.position.x).toBeGreaterThan(0);
  });

  it('puts the Sun-relative camera off to one side of the star line', () => {
    // The star is along +x, so a camera on the star line would be at +x and see
    // a fully lit disc. Off to the side is where the terminator is.
    const frame = framer.compute(createCameraFrame(), anInput({ mode: CameraMode.SunRelative }));
    expect(frame.position.y).toBeGreaterThan(0);
    expect(Math.abs(frame.position.y)).toBeGreaterThan(Math.abs(frame.position.x));
  });

  it('follows the star round, so the terminator stays in frame all year', () => {
    const atStart = framer.compute(
      createCameraFrame(),
      anInput({ mode: CameraMode.SunRelative, starPosition: createVec3(1.5e11, 0, 0) }),
    );
    const halfAYearLater = framer.compute(
      createCameraFrame(),
      anInput({ mode: CameraMode.SunRelative, starPosition: createVec3(-1.5e11, 0, 0) }),
    );
    expect(Math.sign(halfAYearLater.position.y)).toBe(-Math.sign(atStart.position.y));
  });

  it('drifts the cinematic camera without any input at all', () => {
    const early = framer.compute(
      createCameraFrame(),
      anInput({ mode: CameraMode.Cinematic, wallClockSeconds: 0 }),
    );
    const later = framer.compute(
      createCameraFrame(),
      anInput({ mode: CameraMode.Cinematic, wallClockSeconds: 60 }),
    );
    expect(distance(early.position, later.position)).toBeGreaterThan(EARTH_RADIUS);
  });

  it('holds the cinematic camera above the equator', () => {
    const frame = framer.compute(
      createCameraFrame(),
      anInput({ mode: CameraMode.Cinematic, elevation: radians(-1.4) }),
    );
    expect(frame.position.z).toBeGreaterThan(0);
  });
});

/**
 * Reads a vector as a plain triple.
 *
 * @param position - The vector to read.
 * @returns Its components.
 */
function triple(position: Vec3): [number, number, number] {
  return [position.x, position.y, position.z];
}

describe('copying and interpolating frames', () => {
  const framer = createCameraFramer();

  it('copies every part of a frame', () => {
    const source = framer.compute(
      createCameraFrame(),
      anInput({ bodyPosition: createVec3(1, 2, 3) }),
    );
    const copy = copyCameraFrame(createCameraFrame(), source);
    expect(triple(copy.position)).toStrictEqual(triple(source.position));
    expect(triple(copy.target)).toStrictEqual(triple(source.target));
    expect(triple(copy.up)).toStrictEqual(triple(source.up));
  });

  it('copies rather than aliasing', () => {
    const source = framer.compute(createCameraFrame(), anInput());
    const copy = copyCameraFrame(createCameraFrame(), source);
    source.position.x = 999;
    expect(copy.position.x).not.toBe(999);
  });

  it('returns the endpoints exactly', () => {
    const from = framer.compute(
      createCameraFrame(),
      anInput({ bodyPosition: createVec3(0, 0, 0) }),
    );
    const to = framer.compute(
      createCameraFrame(),
      anInput({ bodyPosition: createVec3(1e9, 0, 0) }),
    );
    expect(triple(lerpCameraFrame(createCameraFrame(), from, to, 0).target)).toStrictEqual(
      triple(from.target),
    );
    expect(triple(lerpCameraFrame(createCameraFrame(), from, to, 1).target)).toStrictEqual(
      triple(to.target),
    );
  });

  it('clamps progress rather than flying past the destination', () => {
    const from = framer.compute(
      createCameraFrame(),
      anInput({ bodyPosition: createVec3(0, 0, 0) }),
    );
    const to = framer.compute(
      createCameraFrame(),
      anInput({ bodyPosition: createVec3(1e9, 0, 0) }),
    );
    expect(lerpCameraFrame(createCameraFrame(), from, to, 4).target.x).toBe(1e9);
    expect(lerpCameraFrame(createCameraFrame(), from, to, -4).target.x).toBe(0);
  });

  it('passes through the midpoint on the way', () => {
    const from = framer.compute(
      createCameraFrame(),
      anInput({ bodyPosition: createVec3(0, 0, 0) }),
    );
    const to = framer.compute(
      createCameraFrame(),
      anInput({ bodyPosition: createVec3(1000, 0, 0) }),
    );
    expect(lerpCameraFrame(createCameraFrame(), from, to, 0.5).target.x).toBeCloseTo(500, 9);
  });
});

describe('what each mode holds still', () => {
  const framer = createCameraFramer();

  /**
   * Reads the camera's azimuth about the body, in radians.
   *
   * @param input - The inputs to place the camera with.
   * @returns The angle of the camera's offset in the ecliptic plane.
   */
  function azimuthOf(input: CameraFrameInput): number {
    const frame = framer.compute(createCameraFrame(), input);
    return Math.atan2(
      frame.position.y - input.bodyPosition.y,
      frame.position.x - input.bodyPosition.x,
    );
  }

  it('adds the body rotation in the locked frame, and only there', () => {
    const quarterTurn = radians(Math.PI / 2);
    const locked = azimuthOf(anInput({ mode: CameraMode.Locked, bodyRotation: quarterTurn }));
    const orbit = azimuthOf(anInput({ mode: CameraMode.Orbit, bodyRotation: quarterTurn }));

    expect(locked).toBeCloseTo(Math.PI / 2, 9);
    expect(orbit).toBeCloseTo(0, 9);
  });

  it('holds the sun-relative view off the star line by a fixed angle', () => {
    // The star is along +x, so the direction to it from the body is azimuth 0
    // and the camera sits one terminator offset around from it.
    const offset = azimuthOf(anInput({ mode: CameraMode.SunRelative }));
    expect(offset).toBeCloseTo(Math.PI / 2.35, 9);
  });

  it('follows the star rather than the drag in the sun-relative view', () => {
    const moved = azimuthOf(
      anInput({ mode: CameraMode.SunRelative, starPosition: createVec3(0, 1.5e11, 0) }),
    );
    expect(moved).toBeCloseTo(Math.PI / 2 + Math.PI / 2.35, 9);
  });

  it('sweeps the cinematic dolly one full turn per period', () => {
    // A quarter of the 240-second period is a quarter turn. Measured at a
    // quarter rather than a half so that a sign error cannot hide: half a turn
    // clockwise and half a turn anticlockwise arrive at the same place.
    expect(azimuthOf(anInput({ mode: CameraMode.Cinematic, wallClockSeconds: 60 }))).toBeCloseTo(
      Math.PI / 2,
      9,
    );
    expect(azimuthOf(anInput({ mode: CameraMode.Cinematic, wallClockSeconds: 240 }))).toBeCloseTo(
      0,
      9,
    );
  });

  it('rides at its own elevation in the cinematic dolly, ignoring the drag', () => {
    const frame = framer.compute(
      createCameraFrame(),
      anInput({ mode: CameraMode.Cinematic, elevation: radians(-1.2), wallClockSeconds: 0 }),
    );
    const radius = length(frame.position);
    expect(Math.asin(frame.position.z / radius)).toBeCloseTo(0.28, 9);
  });
});

describe('the up vector', () => {
  const framer = createCameraFramer();

  /** Elevation high enough to put the view within a couple of degrees of the pole. */
  const NEAR_POLE = radians(Math.PI / 2);

  it('is ecliptic north for an ordinary view', () => {
    const frame = framer.compute(createCameraFrame(), anInput({ elevation: radians(0.35) }));
    expect([frame.up.x, frame.up.y, frame.up.z]).toStrictEqual([0, 0, 1]);
  });

  it('swings into the view plane when looking down a pole', () => {
    const frame = framer.compute(createCameraFrame(), anInput({ elevation: NEAR_POLE }));

    // The camera is directly above the body on the +x side, so screen-up points
    // along +x and tips very slightly downward. It is a unit vector and it is
    // perpendicular to the view, and neither of those alone would be enough:
    // the sideways vector `forward x z` satisfies both and is wrong.
    expect(length(frame.up)).toBeCloseTo(1, 9);
    expect(frame.up.x).toBeCloseTo(0.9998, 4);
    expect(frame.up.y).toBeCloseTo(0, 9);
    expect(frame.up.z).toBeCloseTo(-0.02, 4);
  });

  it('is rewritten every frame rather than left from the last one', () => {
    // The same frame is reused, as the rig reuses its scratch. A `writeUp` that
    // only wrote in one branch would leave the pole's answer behind here.
    const frame = createCameraFrame();
    framer.compute(frame, anInput({ elevation: NEAR_POLE }));
    expect(frame.up.z).not.toBe(1);

    framer.compute(frame, anInput({ elevation: radians(0) }));
    expect([frame.up.x, frame.up.y, frame.up.z]).toStrictEqual([0, 0, 1]);
  });

  it('shrinks the horizontal reach as the view rises', () => {
    // cos(elevation) scales the horizontal offset; at 60 degrees the camera is
    // half as far out sideways as it is at the equator, and twice its own
    // height above the body would be wrong.
    const frame = framer.compute(
      createCameraFrame(),
      anInput({ elevation: radians(Math.PI / 3), azimuth: radians(0) }),
    );
    const out = EARTH_RADIUS * DEFAULT_ORBIT_RADII;
    expect(frame.position.x).toBeCloseTo(out * 0.5, 3);
    expect(frame.position.y).toBeCloseTo(0, 3);
    expect(frame.position.z).toBeCloseTo(out * Math.sin(Math.PI / 3), 3);
  });

  it('places the camera around the body as the azimuth turns', () => {
    const frame = framer.compute(
      createCameraFrame(),
      anInput({ elevation: radians(Math.PI / 3), azimuth: radians(Math.PI / 2) }),
    );
    const out = EARTH_RADIUS * DEFAULT_ORBIT_RADII;
    expect(frame.position.x).toBeCloseTo(0, 3);
    expect(frame.position.y).toBeCloseTo(out * 0.5, 3);
  });

  it('is carried by a copy', () => {
    const source = framer.compute(createCameraFrame(), anInput({ elevation: NEAR_POLE }));
    const copied = copyCameraFrame(createCameraFrame(), source);
    expect([copied.up.x, copied.up.y, copied.up.z]).toStrictEqual([
      source.up.x,
      source.up.y,
      source.up.z,
    ]);
  });

  it('is interpolated along with the rest of the frame', () => {
    const from = framer.compute(createCameraFrame(), anInput({ elevation: radians(0) }));
    const to = framer.compute(createCameraFrame(), anInput({ elevation: NEAR_POLE }));
    const half = lerpCameraFrame(createCameraFrame(), from, to, 0.5);
    expect(half.up.x).toBeCloseTo((from.up.x + to.up.x) / 2, 9);
    expect(half.up.z).toBeCloseTo((from.up.z + to.up.z) / 2, 9);
  });
});
