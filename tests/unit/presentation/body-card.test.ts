import { describe, expect, it } from 'vitest';

import type { Body } from '@domain/body';
import { CameraMode } from '@domain/camera/camera-mode';
import { cardText } from '@presentation/ui/body-card';
import { createVec3, type Vec3 } from '@shared/math/vec3';
import { days, meters, radians, seconds, type GravitationalParameter } from '@shared/units';

/** One astronomical unit, in metres. */
const AU = 1.495978707e11;

/**
 * A body carrying just enough for the card, and no orbit.
 *
 * @param overrides - Fields to replace.
 * @returns A body the formatter can read.
 */
function body(overrides: Partial<Body> = {}): Body {
  return {
    id: 'test',
    name: 'Test',
    kind: 'planet',
    parentId: undefined,
    equatorialRadius: meters(6.378137e6),
    polarRadius: meters(6.356752e6),
    gravitationalParameter: 398_600.4355 as GravitationalParameter,
    rotation: {
      poleRightAscension: radians(0),
      poleDeclination: radians(Math.PI / 2),
      primeMeridian: radians(0),
      primeMeridianRate: radians(1),
      rotationPeriod: days(0.99726968),
    },
    albedo: 0.3,
    rings: undefined,
    orbit: undefined,
    ...overrides,
  };
}

/**
 * A point on the x axis.
 *
 * @param x - The distance from the origin, in metres.
 * @returns A vector at that distance.
 */
function at(x: number): Vec3 {
  const out = createVec3();
  out.x = x;
  return out;
}

describe('the card text', () => {
  it('names the camera mode in words rather than in its identifier', () => {
    const text = cardText({
      body: body(),
      mode: CameraMode.SunRelative,
      bodyPosition: at(0),
      starPosition: at(0),
      cameraPosition: at(0),
      simTimeSeconds: seconds(0),
    });
    expect(text.mode).toBe('Sun-relative');
  });

  it('measures to the camera and to the star independently', () => {
    const text = cardText({
      body: body(),
      mode: CameraMode.Orbit,
      bodyPosition: at(AU),
      starPosition: at(0),
      cameraPosition: at(AU + 1e7),
      simTimeSeconds: seconds(0),
    });
    expect(text['distance-star']).toBe('1.000 au');
    expect(text['distance-camera']).toBe('10,000 km');
  });

  it('reports Earth-like gravity for an Earth-like body', () => {
    const text = cardText({
      body: body(),
      mode: CameraMode.Orbit,
      bodyPosition: at(0),
      starPosition: at(0),
      cameraPosition: at(0),
      simTimeSeconds: seconds(0),
    });
    expect(text.gravity).toContain('1.00g');
    expect(text.rotation).toBe('23.93 hours');
  });

  it('shows a dash where a fact does not exist, rather than a zero', () => {
    const text = cardText({
      body: body(),
      mode: CameraMode.Orbit,
      bodyPosition: at(0),
      starPosition: at(0),
      cameraPosition: at(0),
      simTimeSeconds: seconds(0),
    });
    // The stub has no orbit, as the Sun has none.
    expect(text.orbit).toBe('—');
  });

  it('reports every field the card has a row for', () => {
    const text = cardText({
      body: body(),
      mode: CameraMode.Orbit,
      bodyPosition: at(0),
      starPosition: at(0),
      cameraPosition: at(0),
      simTimeSeconds: seconds(0),
    });
    expect(Object.keys(text).toSorted((a, b) => a.localeCompare(b))).toStrictEqual([
      'distance-camera',
      'distance-star',
      'gravity',
      'local-time',
      'mass',
      'mode',
      'orbit',
      'radius',
      'rotation',
    ]);
  });
});
