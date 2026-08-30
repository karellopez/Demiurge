/**
 * Adapter: assembling the solar system scene.
 *
 * Every body from the catalogue, in its real place, at its real size, lit by the
 * Sun. Two things about that are worth stating, because both look like bugs
 * until you know they are not.
 *
 * **At true scale you cannot see the planets.** Earth is a thirteen-thousand
 * kilometre ball an astronomical unit away. So each body is drawn twice: as real
 * geometry, which is correct and usually sub-pixel, and as an additive glare
 * whose size on screen has a floor. See `body-appearance.ts`.
 *
 * **The orbit lines are not idealised ellipses.** Each is sampled from the same
 * propagator that places the body. See `orbit-line.ts`.
 *
 * @module
 */

import {
  PointLight,
  Scene,
  type Line,
  type LineBasicMaterial,
  type Mesh,
  type Points,
  type PointsMaterial,
} from 'three';

import type { BodyCatalog, Body } from '@domain/body';
import type { Vec3 } from '@shared/math/vec3';

import { createBodyMesh, createGlare } from './body-appearance';
import { createOrbitLine } from './orbit-line';

/**
 * The Sun's radiant power, in the units three.js wants for physical falloff.
 *
 * With inverse-square falloff this is what makes Neptune roughly nine hundred
 * times dimmer than Earth, which is the point: the fall-off is not a lighting
 * preference, it is the reason the outer system reads as cold and dim.
 */
const SUN_POWER = 3.5e28;

/** One body's visual representation. */
export interface BodyVisual {
  /** The catalogue entry this draws. */
  readonly body: Body;
  /** Real geometry, at true size. Usually sub-pixel from anywhere useful. */
  readonly mesh: Mesh;
  /** Additive glare, which is what actually makes the body visible. */
  readonly glare: Points;
  /** The orbit line, or `undefined` for the root body. */
  readonly orbitLine: Line | undefined;
}

/** Everything the solar system scene holds. */
export interface SolarSystemVisuals {
  /** The three.js scene, ready to render. */
  readonly scene: Scene;
  /** One entry per body, in catalogue order. */
  readonly visuals: readonly BodyVisual[];
  /** Releases every GPU resource. */
  dispose(): void;
}

/**
 * Builds the visuals for one body and adds them to the scene.
 *
 * @param scene - The scene to add to.
 * @param body - The body to build.
 * @param centuriesSinceJ2000 - When to sample the orbit line.
 * @returns The body's handles.
 */
function addBody(scene: Scene, body: Body, centuriesSinceJ2000: number): BodyVisual {
  const mesh = createBodyMesh(body);
  const glare = createGlare(body);
  const orbitLine = createOrbitLine(body, centuriesSinceJ2000);

  scene.add(mesh, glare);
  if (orbitLine !== undefined) {
    scene.add(orbitLine);
  }

  return { body, mesh, glare, orbitLine };
}

/**
 * Releases one body's GPU resources.
 *
 * @param visual - The body's handles.
 */
function disposeBody(visual: BodyVisual): void {
  visual.mesh.geometry.dispose();
  (visual.mesh.material as MeshStandardMaterialLike).dispose();
  visual.glare.geometry.dispose();
  (visual.glare.material as PointsMaterial).dispose();
  visual.orbitLine?.geometry.dispose();
  (visual.orbitLine?.material as LineBasicMaterial | undefined)?.dispose();
}

/** The disposable shape every three.js material shares. */
interface MeshStandardMaterialLike {
  dispose(): void;
}

/**
 * Builds the scene for a catalogue.
 *
 * @param catalog - The bodies to draw.
 * @param centuriesSinceJ2000 - When to sample the orbit lines.
 * @returns The scene and its per-body handles.
 */
export function createSolarSystemVisuals(
  catalog: BodyCatalog,
  centuriesSinceJ2000: number,
): SolarSystemVisuals {
  const scene = new Scene();

  // The Sun is the only primary light, and it falls off with the square of the
  // distance. A zero distance means "no cutoff", and a decay of 2 is physical.
  const sunlight = new PointLight(0xff_f4_e8, 1, 0, 2);
  sunlight.power = SUN_POWER;
  scene.add(sunlight);

  const visuals = catalog.all.map((body) => addBody(scene, body, centuriesSinceJ2000));

  return {
    scene,
    visuals,
    dispose(): void {
      for (const visual of visuals) {
        disposeBody(visual);
      }
      scene.clear();
    },
  };
}

/**
 * Writes a body's render-space position into its visuals.
 *
 * @param visual - The body's handles.
 * @param renderPosition - Position relative to the render origin, in metres.
 */
export function placeVisual(visual: BodyVisual, renderPosition: Vec3): void {
  visual.mesh.position.set(renderPosition.x, renderPosition.y, renderPosition.z);
  visual.glare.position.set(renderPosition.x, renderPosition.y, renderPosition.z);
}
