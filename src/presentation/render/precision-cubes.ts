/**
 * The contents of the phase-1 precision scene.
 *
 * Three objects, chosen so that one frame exercises both halves of the problem:
 *
 * - a **one-metre cube six metres away**, which is the near end of the depth
 *   range and the thing that would visibly jitter if the floating origin were
 *   wrong;
 * - a **hundred-kilometre sphere ten thousand kilometres away**, which is far
 *   enough that a conventional depth buffer would z-fight it against the near
 *   cube, and large enough that the failure would be impossible to miss;
 * - a **one-metre cube at 4.5e12 m**, Neptune's distance, which is the
 *   floating-origin stress test.
 *
 * That third object deserves a note, because it looks like a mistake. It is
 * submitted, it is not culled, and its render-space position is stable to the
 * millimetre — but it covers about 1e-13 of a pixel, so it produces no
 * fragments and you will never see it. That is not a bug in the scene; it is the
 * physical fact that a one-metre object at thirty astronomical units is
 * invisible, and it is exactly why phase 4 draws distant bodies as physically
 * motivated glare impostors rather than as geometry. What this scene proves
 * about it is that the maths does not fall apart out there.
 *
 * Each object keeps its own f64 world position; the mesh's `position` is only
 * ever written with the f32 offset from the render origin.
 *
 * @module
 */

import {
  BoxGeometry,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  Scene,
  SphereGeometry,
} from 'three';

import { createVec3, type Vec3 } from '@shared/math/vec3';
import { METERS_PER_AU } from '@shared/units';

/** Neptune's approximate heliocentric distance, in metres. */
const NEPTUNE_DISTANCE_METERS = 4.5e12;

/** How far ahead of the camera the near cube sits, in metres. */
export const NEAR_CUBE_OFFSET_METERS = 6;

/** Distance to the large sphere, in metres. Ten thousand kilometres. */
const FAR_SPHERE_DISTANCE_METERS = 1e7;

/** Radius of the large sphere, in metres. A hundred kilometres. */
const FAR_SPHERE_RADIUS_METERS = 1e5;

/** One entry in the scene: an f64 world position and the mesh that draws it. */
export interface PlacedBody {
  /** Where it really is, in heliocentric metres, in f64. */
  readonly worldPositionMeters: Vec3;
  /** The mesh, whose position holds only the f32 offset from the render origin. */
  readonly mesh: Mesh;
}

/**
 * Builds one body.
 *
 * @param mesh - The mesh to place.
 * @param worldPositionMeters - Position in heliocentric metres.
 * @returns The body.
 */
function place(mesh: Mesh, worldPositionMeters: Vec3): PlacedBody {
  return { worldPositionMeters, mesh };
}

/**
 * Builds the scene and everything in it.
 *
 * The camera orbits the origin of this arrangement looking down +X, so all three
 * bodies sit in front of it and all three are submitted every frame.
 *
 * @returns The scene and the bodies placed in it.
 */
export function createSceneContents(): { scene: Scene; bodies: readonly PlacedBody[] } {
  const scene = new Scene();

  const sunlight = new DirectionalLight(0xff_f4_e8, 3);
  sunlight.position.set(-0.4, 0.7, 0.6);
  scene.add(sunlight);

  const nearCube = new Mesh(
    new BoxGeometry(1, 1, 1),
    new MeshStandardMaterial({ color: 0x7f_d1_e8, roughness: 0.5, metalness: 0.05 }),
  );
  const farSphere = new Mesh(
    new SphereGeometry(FAR_SPHERE_RADIUS_METERS, 48, 32),
    new MeshStandardMaterial({ color: 0xe8_a1_5f, roughness: 0.85, metalness: 0 }),
  );
  const neptuneCube = new Mesh(
    new BoxGeometry(1, 1, 1),
    new MeshStandardMaterial({ color: 0xd5_c7_e8, roughness: 0.5, metalness: 0.05 }),
  );

  const bodies: readonly PlacedBody[] = [
    place(nearCube, createVec3(METERS_PER_AU + NEAR_CUBE_OFFSET_METERS, 0, 0)),
    // Offset slightly so the near cube does not sit exactly on top of it.
    place(
      farSphere,
      createVec3(METERS_PER_AU + FAR_SPHERE_DISTANCE_METERS, -FAR_SPHERE_RADIUS_METERS * 1.4, 0),
    ),
    place(neptuneCube, createVec3(NEPTUNE_DISTANCE_METERS, 0, 0)),
  ];

  for (const body of bodies) {
    // Frustum culling uses the mesh's *render-space* bounding sphere, which is
    // written fresh every frame. Leaving it on would cull whichever body has not
    // been positioned yet on the very first frame.
    body.mesh.frustumCulled = false;
    scene.add(body.mesh);
  }

  return { scene, bodies };
}

/**
 * Releases every GPU resource the bodies hold.
 *
 * @param scene - The scene they were added to.
 * @param bodies - The bodies to release.
 */
export function disposeSceneContents(scene: Scene, bodies: readonly PlacedBody[]): void {
  for (const body of bodies) {
    body.mesh.geometry.dispose();
    (body.mesh.material as MeshStandardMaterial).dispose();
    scene.remove(body.mesh);
  }
}
