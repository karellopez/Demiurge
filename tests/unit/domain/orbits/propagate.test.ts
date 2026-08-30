import { describe, expect, it } from 'vitest';

import type { EvaluatedElements, OrbitalElements } from '@domain/orbits/elements';
import {
  angularSeparation,
  eclipticLongitude,
  evaluateElements,
  positionFromElements,
  propagateOrbit,
} from '@domain/orbits/propagate';
import { createVec3, length } from '@shared/math/vec3';
import { METERS_PER_AU, radians } from '@shared/units';

/**
 * Builds an orbit, overriding only what a test is about.
 *
 * @param overrides - The elements under test.
 * @returns Complete elements, circular and in the ecliptic plane by default.
 */
function anOrbit(overrides: Partial<OrbitalElements> = {}): OrbitalElements {
  return {
    semiMajorAxis: 1 as OrbitalElements['semiMajorAxis'],
    eccentricity: 0,
    inclination: radians(0),
    meanLongitude: radians(0),
    longitudeOfPerihelion: radians(0),
    longitudeOfAscendingNode: radians(0),
    semiMajorAxisRate: 0 as OrbitalElements['semiMajorAxisRate'],
    eccentricityRate: 0,
    inclinationRate: radians(0),
    meanLongitudeRate: radians(0),
    longitudeOfPerihelionRate: radians(0),
    longitudeOfAscendingNodeRate: radians(0),
    ...overrides,
  };
}

/**
 * Builds an evaluated element set, overriding only what a test is about.
 *
 * @param overrides - The elements under test.
 * @returns A complete evaluated set, circular and in the ecliptic by default.
 */
function evaluated(overrides: Partial<EvaluatedElements> = {}): EvaluatedElements {
  return {
    semiMajorAxis: 1 as EvaluatedElements['semiMajorAxis'],
    eccentricity: 0,
    inclination: radians(0),
    meanLongitude: radians(0),
    longitudeOfPerihelion: radians(0),
    longitudeOfAscendingNode: radians(0),
    ...overrides,
  };
}

describe('advancing the elements', () => {
  it('leaves them alone at the epoch', () => {
    expect(evaluateElements(anOrbit({ meanLongitudeRate: radians(1) }), 0).meanLongitude).toBe(0);
  });

  it('applies each rate over the elapsed centuries', () => {
    const result = evaluateElements(
      anOrbit({ eccentricity: 0.1, eccentricityRate: 0.01, meanLongitudeRate: radians(2) }),
      3,
    );
    expect(result.eccentricity).toBeCloseTo(0.13, 12);
    expect(result.meanLongitude).toBeCloseTo(6, 12);
  });

  it('runs the rates backwards before the epoch', () => {
    expect(
      evaluateElements(anOrbit({ eccentricity: 0.1, eccentricityRate: 0.01 }), -2).eccentricity,
    ).toBeCloseTo(0.08, 12);
  });

  it('advances every element, not just the mean longitude', () => {
    const result = evaluateElements(
      anOrbit({
        semiMajorAxisRate: 0.5 as OrbitalElements['semiMajorAxisRate'],
        inclinationRate: radians(0.2),
        longitudeOfPerihelionRate: radians(0.3),
        longitudeOfAscendingNodeRate: radians(0.4),
      }),
      2,
    );
    expect(result.semiMajorAxis).toBeCloseTo(2, 12);
    expect(result.inclination).toBeCloseTo(0.4, 12);
    expect(result.longitudeOfPerihelion).toBeCloseTo(0.6, 12);
    expect(result.longitudeOfAscendingNode).toBeCloseTo(0.8, 12);
  });
});

describe('placing a body on a circular orbit in the ecliptic', () => {
  it('starts at one semi-major axis along +x', () => {
    const position = positionFromElements(createVec3(), evaluated());
    expect(position.x).toBeCloseTo(METERS_PER_AU, 0);
    expect(position.y).toBeCloseTo(0, 6);
    expect(position.z).toBeCloseTo(0, 6);
  });

  it('stays in the ecliptic plane when the inclination is zero', () => {
    for (const meanLongitude of [0, 0.7, 2.1, 4.4, 6]) {
      const position = positionFromElements(
        createVec3(),
        evaluated({ meanLongitude: radians(meanLongitude) }),
      );
      expect(Math.abs(position.z)).toBeLessThan(1);
    }
  });

  it('keeps a constant radius all the way round', () => {
    for (const meanLongitude of [0, 1, 2, 3, 4, 5, 6]) {
      const position = positionFromElements(
        createVec3(),
        evaluated({
          semiMajorAxis: 2 as EvaluatedElements['semiMajorAxis'],
          meanLongitude: radians(meanLongitude),
        }),
      );
      expect(length(position)).toBeCloseTo(2 * METERS_PER_AU, 0);
    }
  });

  it('advances anticlockwise as the mean longitude grows', () => {
    const quarter = positionFromElements(
      createVec3(),
      evaluated({ meanLongitude: radians(Math.PI / 2) }),
    );
    expect(quarter.y).toBeGreaterThan(0);
    expect(Math.abs(quarter.x)).toBeLessThan(METERS_PER_AU * 0.001);
  });
});

describe('eccentricity', () => {
  it('puts periapsis inside and apoapsis outside the semi-major axis', () => {
    const periapsis = positionFromElements(
      createVec3(),
      evaluated({ eccentricity: 0.5, meanLongitude: radians(0) }),
    );
    const apoapsis = positionFromElements(
      createVec3(),
      evaluated({ eccentricity: 0.5, meanLongitude: radians(Math.PI) }),
    );
    expect(length(periapsis)).toBeCloseTo(0.5 * METERS_PER_AU, 0);
    expect(length(apoapsis)).toBeCloseTo(1.5 * METERS_PER_AU, 0);
  });

  it('places perihelion where the longitude of perihelion says', () => {
    const position = positionFromElements(
      createVec3(),
      evaluated({
        eccentricity: 0.5,
        meanLongitude: radians(Math.PI / 2),
        longitudeOfPerihelion: radians(Math.PI / 2),
      }),
    );
    expect(eclipticLongitude(position)).toBeCloseTo(Math.PI / 2, 6);
  });
});

describe('inclination', () => {
  it('lifts the body out of the ecliptic away from the node', () => {
    const position = positionFromElements(
      createVec3(),
      evaluated({ inclination: radians(Math.PI / 6), meanLongitude: radians(Math.PI / 2) }),
    );
    expect(Math.abs(position.z)).toBeGreaterThan(METERS_PER_AU * 0.4);
  });

  it('crosses the ecliptic exactly at the ascending node', () => {
    const position = positionFromElements(
      createVec3(),
      evaluated({ inclination: radians(Math.PI / 6), meanLongitude: radians(0) }),
    );
    expect(Math.abs(position.z)).toBeLessThan(1);
  });

  it('goes north after the ascending node and south before it', () => {
    const north = positionFromElements(
      createVec3(),
      evaluated({ inclination: radians(0.5), meanLongitude: radians(1) }),
    );
    const south = positionFromElements(
      createVec3(),
      evaluated({ inclination: radians(0.5), meanLongitude: radians(-1) }),
    );
    expect(north.z).toBeGreaterThan(0);
    expect(south.z).toBeLessThan(0);
  });
});

describe('propagating over time', () => {
  it('returns to the same place after a whole number of orbits', () => {
    const elements = anOrbit({ meanLongitudeRate: radians(Math.PI * 2) });
    const atEpoch = propagateOrbit(createVec3(), elements, 0);
    const afterOneOrbit = propagateOrbit(createVec3(), elements, 1);
    expect(afterOneOrbit.x).toBeCloseTo(atEpoch.x, 3);
    expect(afterOneOrbit.y).toBeCloseTo(atEpoch.y, 3);
  });

  it('is halfway round after half an orbit', () => {
    const half = propagateOrbit(
      createVec3(),
      anOrbit({ meanLongitudeRate: radians(Math.PI * 2) }),
      0.5,
    );
    expect(half.x).toBeCloseTo(-METERS_PER_AU, 0);
  });

  it('writes into the caller vector rather than allocating', () => {
    const target = createVec3();
    expect(propagateOrbit(target, anOrbit(), 0)).toBe(target);
  });
});

describe('ecliptic longitude', () => {
  it('is zero along +x', () => {
    expect(eclipticLongitude(createVec3(1, 0, 0))).toBeCloseTo(0, 12);
  });

  it('is a quarter turn along +y', () => {
    expect(eclipticLongitude(createVec3(0, 1, 0))).toBeCloseTo(Math.PI / 2, 12);
  });

  it('wraps into a positive range rather than going negative', () => {
    expect(eclipticLongitude(createVec3(0, -1, 0))).toBeCloseTo(Math.PI * 1.5, 12);
  });

  it('ignores the out-of-plane component', () => {
    expect(eclipticLongitude(createVec3(1, 0, 99))).toBeCloseTo(0, 12);
  });
});

describe('angular separation', () => {
  it('is zero for identical longitudes', () => {
    expect(angularSeparation(radians(1.2), radians(1.2))).toBe(0);
  });

  it('takes the short way round the circle', () => {
    // 359.9 degrees and 0.1 degrees are two tenths apart, not 359.8. A
    // comparison that got this wrong would pass or fail almost at random for a
    // body near the equinox.
    const almostFull = radians((359.9 * Math.PI) / 180);
    const justPast = radians((0.1 * Math.PI) / 180);
    expect((angularSeparation(almostFull, justPast) * 180) / Math.PI).toBeCloseTo(0.2, 9);
  });

  it('is symmetric', () => {
    expect(angularSeparation(radians(0.3), radians(2.9))).toBeCloseTo(
      angularSeparation(radians(2.9), radians(0.3)),
      12,
    );
  });

  it('never exceeds half a turn', () => {
    for (const [first, second] of [
      [0, Math.PI],
      [0, Math.PI * 1.99],
      [5, 1],
    ] as const) {
      expect(angularSeparation(radians(first), radians(second))).toBeLessThanOrEqual(
        Math.PI + 1e-12,
      );
    }
  });
});
