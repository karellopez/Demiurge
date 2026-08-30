import { describe, expect, it } from 'vitest';

import { flattening, surfaceGravity } from '@domain/body';
import { buildCatalog } from '@features/space/body-catalog';
import type { RawCatalog } from '@features/space/catalog-schema';
import { METERS_PER_AU } from '@shared/units';

import rawCatalog from '../../data/bodies.json';

/**
 * The catalogue is hand-maintained and cites its sources, which makes it exactly
 * the kind of file where a transposed digit slips through. `npm run validate:data`
 * checks its shape; these check that the numbers mean what they should once
 * they have been converted into the simulation's units.
 */

const catalog = buildCatalog(rawCatalog as unknown as RawCatalog);

describe('the tree', () => {
  it('has the Sun at the root', () => {
    expect(catalog.root.id).toBe('sun');
    expect(catalog.root.parentId).toBeUndefined();
    expect(catalog.root.orbit).toBeUndefined();
  });

  it('carries every body the brief names', () => {
    for (const id of [
      'mercury',
      'venus',
      'earth',
      'mars',
      'jupiter',
      'saturn',
      'uranus',
      'neptune',
      'pluto',
      'ceres',
      'eris',
      'moon',
      'phobos',
      'deimos',
      'io',
      'europa',
      'ganymede',
      'callisto',
      'titan',
      'enceladus',
      'mimas',
      'iapetus',
      'triton',
      'charon',
    ]) {
      expect(catalog.byId(id), `${id} is missing`).toBeDefined();
    }
  });

  it('hangs the Galilean moons off Jupiter', () => {
    const ids = catalog.childrenOf('jupiter').map((body) => body.id);
    expect(ids).toStrictEqual(['io', 'europa', 'ganymede', 'callisto']);
  });

  it('walks a moon up to the Sun', () => {
    expect(catalog.ancestorsOf('titan').map((body) => body.id)).toStrictEqual(['saturn', 'sun']);
  });

  it('reports nothing for an unknown id', () => {
    expect(catalog.byId('vulcan')).toBeUndefined();
    expect(catalog.childrenOf('vulcan')).toStrictEqual([]);
    expect(catalog.ancestorsOf('vulcan')).toStrictEqual([]);
  });

  it('gives every body but the root an orbit', () => {
    for (const body of catalog.all) {
      if (body.id === 'sun') {
        continue;
      }
      expect(body.orbit, `${body.id} has no orbit`).toBeDefined();
    }
  });
});

describe('units are converted exactly once', () => {
  it('states Earth radius in metres', () => {
    expect(catalog.byId('earth')?.equatorialRadius).toBeCloseTo(6_378_137, 0);
  });

  it('states the Earth semi-major axis as one astronomical unit', () => {
    expect(catalog.byId('earth')?.orbit?.semiMajorAxis).toBeCloseTo(1, 4);
  });

  it('converts a moon semi-major axis from kilometres into astronomical units', () => {
    // The Moon's is about 381 875 km, which is a little under a four-hundredth
    // of an astronomical unit.
    const semiMajorAxis = catalog.byId('moon')?.orbit?.semiMajorAxis ?? 0;
    expect(semiMajorAxis * METERS_PER_AU).toBeCloseTo(381_874_525, -3);
  });

  it('converts angles from degrees into radians', () => {
    // Pluto's inclination is 17.14 degrees, which is about 0.299 radians.
    expect(catalog.byId('pluto')?.orbit?.inclination).toBeCloseTo(0.29915, 4);
  });
});

describe('the physical numbers are right', () => {
  it('gives Earth about 9.8 metres per second squared at the surface', () => {
    expect(surfaceGravity(catalog.byId('earth')!)).toBeCloseTo(9.8, 1);
  });

  it('gives the Moon about a sixth of that, which is why Moon jumps feel different', () => {
    const earth = surfaceGravity(catalog.byId('earth')!);
    const moon = surfaceGravity(catalog.byId('moon')!);
    expect(moon / earth).toBeCloseTo(0.166, 2);
  });

  it('gives Mars about 3.7 metres per second squared', () => {
    expect(surfaceGravity(catalog.byId('mars')!)).toBeCloseTo(3.72, 1);
  });

  it('makes Saturn visibly oblate and Earth barely so', () => {
    expect(flattening(catalog.byId('saturn')!)).toBeCloseTo(0.098, 2);
    expect(flattening(catalog.byId('earth')!)).toBeLessThan(0.004);
  });

  it('never lets a polar radius exceed an equatorial one', () => {
    for (const body of catalog.all) {
      expect(flattening(body), `${body.id} is prolate`).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('rotation', () => {
  it('marks Venus and Uranus as retrograde', () => {
    expect(catalog.byId('venus')?.rotation.rotationPeriod).toBeLessThan(0);
    expect(catalog.byId('uranus')?.rotation.rotationPeriod).toBeLessThan(0);
  });

  it('turns the Earth once a sidereal day', () => {
    expect(catalog.byId('earth')?.rotation.rotationPeriod).toBeCloseTo(0.9973, 3);
  });

  it('puts the Earth pole at the celestial pole, by definition of the frame', () => {
    expect(catalog.byId('earth')?.rotation.poleDeclination).toBeCloseTo(Math.PI / 2, 6);
  });
});

describe('rings', () => {
  it('gives Saturn and Uranus rings, and nobody else', () => {
    const ringed = catalog.all.filter((body) => body.rings !== undefined).map((body) => body.id);
    expect(ringed.toSorted((a, b) => a.localeCompare(b))).toStrictEqual(['saturn', 'uranus']);
  });

  it('puts the rings outside the planet', () => {
    for (const id of ['saturn', 'uranus']) {
      const body = catalog.byId(id)!;
      expect(body.rings!.innerRadius).toBeGreaterThan(body.equatorialRadius);
      expect(body.rings!.outerRadius).toBeGreaterThan(body.rings!.innerRadius);
    }
  });
});

/** The raw entries, typed loosely so a test can deliberately break one. */
const entries = rawCatalog.bodies as unknown as Record<string, unknown>[];

/**
 * Builds a catalogue from a deliberately broken list.
 *
 * @param bodies - The entries to build from.
 * @returns Whatever `buildCatalog` does with them.
 */
function build(bodies: readonly unknown[]): unknown {
  return buildCatalog({ epoch: 'J2000.0', bodies } as unknown as RawCatalog);
}

describe('a malformed catalogue', () => {
  it('refuses a catalogue with no root', () => {
    expect(() => build([{ ...entries[1], parent: 'nowhere' }])).toThrow(/exactly one root/u);
  });

  it('refuses a catalogue with two roots', () => {
    expect(() => build([entries[0], { ...entries[0], id: 'sun-two' }])).toThrow(
      /exactly one root/u,
    );
  });
});
