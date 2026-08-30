/**
 * Drawing an orbit.
 *
 * Sampled from the same propagator that places the body, so the line is a
 * picture of what the simulation actually believes rather than an idealised
 * ellipse drawn beside it. If a planet ever drifts off its own line, the bug is
 * real and it is visible, which is the whole reason for doing it this way.
 *
 * @module
 */

import { BufferGeometry, Float32BufferAttribute, Line, LineBasicMaterial } from 'three';

import type { Body } from '@domain/body';
import { propagateOrbit } from '@domain/orbits/propagate';
import { createVec3 } from '@shared/math/vec3';

import { colorFor } from './body-appearance';

/** Samples per orbit. Enough that Mercury reads as a smooth curve. */
const ORBIT_LINE_SAMPLES = 512;

/**
 * Samples a body's orbit into a line.
 *
 * @param body - The body whose orbit to draw.
 * @param centuriesSinceJ2000 - When to evaluate the slowly-drifting elements.
 * @returns The line in the parent's frame, or `undefined` for the root body.
 */
export function createOrbitLine(body: Body, centuriesSinceJ2000: number): Line | undefined {
  const elements = body.orbit;
  if (elements === undefined) {
    return undefined;
  }

  const positions = new Float32Array((ORBIT_LINE_SAMPLES + 1) * 3);
  const sample = createVec3();
  const orbitalPeriodCenturies = (Math.PI * 2) / Math.abs(elements.meanLongitudeRate);

  for (let index = 0; index <= ORBIT_LINE_SAMPLES; index += 1) {
    const fraction = index / ORBIT_LINE_SAMPLES;
    propagateOrbit(sample, elements, centuriesSinceJ2000 + fraction * orbitalPeriodCenturies);
    positions[index * 3] = sample.x;
    positions[index * 3 + 1] = sample.y;
    positions[index * 3 + 2] = sample.z;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));

  const line = new Line(
    geometry,
    new LineBasicMaterial({
      color: colorFor(body),
      transparent: true,
      // Moon orbits are drawn fainter: at system scale they are a thicket around
      // each giant planet and would otherwise drown the planet itself.
      opacity: body.kind === 'moon' ? 0.25 : 0.4,
      depthWrite: false,
    }),
  );
  line.frustumCulled = false;
  return line;
}
