import { describe, expect, it } from 'vitest';

import { angularSeparation, eclipticLongitude } from '@domain/orbits/propagate';
import { fromJulianDate } from '@domain/time/julian';
import { buildCatalog } from '@features/space/body-catalog';
import type { RawCatalog } from '@features/space/catalog-schema';
import { createSystemState } from '@features/space/propagate-system';
import { createVec3, length } from '@shared/math/vec3';
import { days, radiansToDegrees } from '@shared/units';

import rawCatalog from '../../data/bodies.json';
import horizonsFixture from '../fixtures/horizons/planet-states.json';

/**
 * The phase-2 acceptance criterion: positions match JPL Horizons.
 *
 * `tests/fixtures/horizons/planet-states.json` holds real heliocentric state
 * vectors fetched from JPL, referred to the mean ecliptic and equinox of J2000 —
 * the same frame the propagator produces, which is what makes this a measurement
 * rather than an approximation. Three dates: one at the epoch, one a century
 * before, one half a century after, so that an error in the *rates* cannot hide
 * behind a correct value at the epoch.
 *
 * The brief sets the bar at 0.1 degrees of heliocentric longitude and says that
 * where it cannot be reached, the achieved accuracy is documented rather than
 * the test quietly loosened. Saturn is the one body that cannot reach it, and
 * the per-body table below says so out loud, with the reason. See
 * `docs/astronomy.md`.
 */

/** The bar the brief sets, in degrees of heliocentric longitude. */
const DEFAULT_TOLERANCE_DEG = 0.1;

/**
 * Bodies that need a stated tolerance of their own, and why.
 *
 * Saturn is the great inequality: Jupiter and Saturn are close to a 5:2
 * resonance, which drives a periodic swing in Saturn's longitude of roughly a
 * tenth of a degree with a period near nine hundred years. A mean-element fit
 * has no term for it by construction, so no amount of care with the transcription
 * removes this; only a fuller theory such as VSOP87 would. The figure here is the
 * measured worst case with a little headroom, not a number chosen to make the
 * test green.
 */
const PER_BODY_TOLERANCE_DEG: Readonly<Record<string, number>> = {
  saturn: 0.16,
};

/** The catalogue, loaded once for the suite. */
const catalog = buildCatalog(rawCatalog as unknown as RawCatalog);

/** One Horizons state vector. */
interface HorizonsState {
  readonly body: string;
  readonly date: string;
  readonly julianDate: number;
  readonly positionKm: readonly [number, number, number];
}

const fixture = horizonsFixture as unknown as { readonly states: readonly HorizonsState[] };

/**
 * Measures the propagator against one Horizons state.
 *
 * @param state - The reference state.
 * @returns The longitude error in degrees and the radial error as a fraction.
 */
function measure(state: HorizonsState): { longitudeErrorDeg: number; radialError: number } {
  const system = createSystemState(catalog);
  system.update(fromJulianDate(days(state.julianDate)));

  const simulated = system.readPosition(state.body, createVec3());
  const reference = createVec3(
    state.positionKm[0] * 1000,
    state.positionKm[1] * 1000,
    state.positionKm[2] * 1000,
  );

  const longitudeErrorDeg = radiansToDegrees(
    angularSeparation(eclipticLongitude(simulated), eclipticLongitude(reference)),
  );
  const referenceDistance = length(reference);

  return {
    longitudeErrorDeg,
    radialError: Math.abs(length(simulated) - referenceDistance) / referenceDistance,
  };
}

describe('the fixtures themselves', () => {
  it('cover three dates spanning the fitted range', () => {
    const dates = new Set(fixture.states.map((state) => state.date));
    expect([...dates].toSorted((a, b) => a.localeCompare(b))).toStrictEqual([
      '1900-01-01',
      '2000-01-01',
      '2050-01-01',
    ]);
  });

  it('cover every planet and Pluto', () => {
    const bodies = new Set(fixture.states.map((state) => state.body));
    expect([...bodies].toSorted((a, b) => a.localeCompare(b))).toStrictEqual([
      'earth',
      'jupiter',
      'mars',
      'mercury',
      'neptune',
      'pluto',
      'saturn',
      'uranus',
      'venus',
    ]);
  });

  it('name bodies the catalogue actually has', () => {
    for (const state of fixture.states) {
      expect(catalog.byId(state.body), `catalogue is missing ${state.body}`).toBeDefined();
    }
  });
});

describe('heliocentric longitude against JPL Horizons', () => {
  for (const state of fixture.states) {
    const tolerance = PER_BODY_TOLERANCE_DEG[state.body] ?? DEFAULT_TOLERANCE_DEG;

    it(`places ${state.body} on ${state.date} within ${String(tolerance)} degrees`, () => {
      expect(measure(state).longitudeErrorDeg).toBeLessThan(tolerance);
    });
  }

  it('clears the brief bar for every body except Saturn', () => {
    const overBar = fixture.states
      .filter((state) => measure(state).longitudeErrorDeg >= DEFAULT_TOLERANCE_DEG)
      .map((state) => state.body);
    expect([...new Set(overBar)]).toStrictEqual(['saturn']);
  });
});

describe('heliocentric distance against JPL Horizons', () => {
  it('places every body within 0.3 per cent of the right distance', () => {
    for (const state of fixture.states) {
      const { radialError } = measure(state);
      expect(radialError, `${state.body} on ${state.date}`).toBeLessThan(0.003);
    }
  });
});

describe('the moons ride with their planets', () => {
  it('keeps each moon within its parent sphere of influence', () => {
    // A moon whose orbit was accidentally treated as heliocentric would appear
    // an astronomical unit from its planet. This is the cheap check that the
    // parent chain is being accumulated at all.
    const system = createSystemState(catalog);
    system.update(fromJulianDate(days(2_451_545)));

    const moonPosition = createVec3();
    const parentPosition = createVec3();

    const moons = catalog.all.filter((candidate) => candidate.kind === 'moon');
    for (const body of moons) {
      system.readPosition(body.id, moonPosition);
      system.readPosition(body.parentId ?? '', parentPosition);

      const separation = Math.hypot(
        moonPosition.x - parentPosition.x,
        moonPosition.y - parentPosition.y,
        moonPosition.z - parentPosition.z,
      );
      // Every catalogued moon orbits inside 4 million km of its planet.
      expect(separation, `${body.name} is too far from its parent`).toBeLessThan(4e9);
      expect(separation, `${body.name} sits on top of its parent`).toBeGreaterThan(1e6);
    }
  });
});
