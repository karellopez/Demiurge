/**
 * The contents of the phase-1 precision scene.
 *
 * Two one-metre cubes: one at 1 au from the origin, one at 4.5e12 m, which is
 * Neptune's distance. Their whole job is to be somewhere very far away and stay
 * exactly still while the camera moves, which is the visible form of the
 * floating-origin guarantee.
 *
 * Each cube keeps its own f64 world position; the mesh's `position` is only ever
 * written with the f32 offset from the render origin.
 *
 * @module
 */

import { BoxGeometry, DirectionalLight, Mesh, MeshStandardMaterial, Scene } from 'three';

import { createVec3, type Vec3 } from '@shared/math/vec3';
import { METERS_PER_AU } from '@shared/units';

/** Neptune's approximate heliocentric distance, in metres. */
const NEPTUNE_DISTANCE_METERS = 4.5e12;

/** One entry in the scene: an f64 world position and the mesh that draws it. */
export interface PlacedCube {
  /** Where the cube really is, in heliocentric metres, in f64. */
  readonly worldPositionMeters: Vec3;
  /** The mesh, whose position holds only the f32 offset from the render origin. */
  readonly mesh: Mesh;
}

/**
 * Builds one cube.
 *
 * @param sizeMeters - Edge length.
 * @param color - Surface colour.
 * @param worldPositionMeters - Position in heliocentric metres.
 * @returns The cube and its world position.
 */
function createCube(sizeMeters: number, color: number, worldPositionMeters: Vec3): PlacedCube {
  const geometry = new BoxGeometry(sizeMeters, sizeMeters, sizeMeters);
  const material = new MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05 });
  return { worldPositionMeters, mesh: new Mesh(geometry, material) };
}

/**
 * Builds the scene and everything in it.
 *
 * @returns The scene and the cubes placed in it.
 */
export function createSceneContents(): { scene: Scene; cubes: readonly PlacedCube[] } {
  const scene = new Scene();

  const sunlight = new DirectionalLight(0xff_f4_e8, 3);
  sunlight.position.set(1, 0.6, 0.4);
  scene.add(sunlight);

  const cubes: readonly PlacedCube[] = [
    createCube(1, 0x7f_d1_e8, createVec3(METERS_PER_AU, 0, 0)),
    createCube(1, 0xe8_a1_5f, createVec3(NEPTUNE_DISTANCE_METERS, 0, 0)),
  ];
  for (const cube of cubes) {
    scene.add(cube.mesh);
  }

  return { scene, cubes };
}

/**
 * Releases every GPU resource the cubes hold.
 *
 * @param scene - The scene they were added to.
 * @param cubes - The cubes to release.
 */
export function disposeSceneContents(scene: Scene, cubes: readonly PlacedCube[]): void {
  for (const cube of cubes) {
    cube.mesh.geometry.dispose();
    (cube.mesh.material as MeshStandardMaterial).dispose();
    scene.remove(cube.mesh);
  }
}
