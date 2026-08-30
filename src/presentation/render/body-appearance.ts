/**
 * How a body looks, before there is any real imagery to look at.
 *
 * Phase 4 replaces all of this with PBR materials and fetched textures. Until
 * then a body is a coloured sphere plus a glare sprite, and the two exist for
 * different reasons:
 *
 * - The **sphere** is real geometry at true size. It is correct, and from
 *   anywhere useful it is also sub-pixel, which is why it is not enough.
 * - The **glare** is an additive point with a floor on its screen size. That is
 *   not a cheat: a point source spreads across the eye's aperture, which is
 *   exactly why Venus is a bright dot in the evening sky rather than an
 *   invisible one. It is the same reasoning that leads to physically motivated
 *   glare impostors for distant bodies later on.
 *
 * @module
 */

import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Points,
  PointsMaterial,
  SphereGeometry,
} from 'three';

import { flattening, type Body } from '@domain/body';

/** Latitude and longitude segments for a body's sphere. */
const SPHERE_SEGMENTS = 48;

/** Screen-space size of a star's glare, in pixels. */
const STAR_GLARE_PIXELS = 26;

/** Screen-space size of every other body's glare, in pixels. */
const BODY_GLARE_PIXELS = 8;

/** Rough surface colours, until real imagery arrives in phase 4. */
const BODY_COLORS: Readonly<Record<string, number>> = {
  sun: 0xff_f2_cc,
  mercury: 0x9a_8f_86,
  venus: 0xe6_c9_8a,
  earth: 0x4a_7a_b5,
  mars: 0xb5_5f_3c,
  jupiter: 0xd2_ad_84,
  saturn: 0xe0_c9_92,
  uranus: 0x9d_d3_e0,
  neptune: 0x4f_6f_c4,
  pluto: 0xbf_ab_98,
  ceres: 0x8c_86_80,
  eris: 0xd8_d8_d8,
  moon: 0x9e_9e_9e,
};

/** Fallback colour for a body with no entry above. */
const DEFAULT_BODY_COLOR = 0xa0_a0_a0;

/**
 * Chooses a body's colour.
 *
 * @param body - The body to colour.
 * @returns A colour, scaled by albedo so dark bodies read as dark.
 */
export function colorFor(body: Body): Color {
  const base = new Color(BODY_COLORS[body.id] ?? DEFAULT_BODY_COLOR);
  if (body.kind === 'star') {
    return base;
  }
  // Albedo already separates Enceladus from Callisto in the catalogue; nudging
  // the colour by it keeps that difference visible before textures exist.
  return base.multiplyScalar(0.55 + Math.min(1, body.albedo) * 0.45);
}

/**
 * Builds the mesh for one body, oblate where the catalogue says it is.
 *
 * @param body - The body to build.
 * @returns The mesh, at true scale in metres.
 */
export function createBodyMesh(body: Body): Mesh {
  const geometry = new SphereGeometry(body.equatorialRadius, SPHERE_SEGMENTS, SPHERE_SEGMENTS / 2);
  const material =
    body.kind === 'star'
      ? new MeshBasicMaterial({ color: colorFor(body) })
      : new MeshStandardMaterial({ color: colorFor(body), roughness: 0.9, metalness: 0 });

  const mesh = new Mesh(geometry, material);
  // Squash the poles. Saturn's flattening is about 0.098 and is very visible;
  // drawing it as a sphere is the first thing an astronomer notices.
  mesh.scale.set(1, 1 - flattening(body), 1);
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * Builds the additive glare that makes a body visible at true scale.
 *
 * @param body - The body to represent.
 * @returns A single point, sized in screen space by its material.
 */
export function createGlare(body: Body): Points {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0], 3));

  const isStar = body.kind === 'star';
  const material = new PointsMaterial({
    color: colorFor(body),
    size: isStar ? STAR_GLARE_PIXELS : BODY_GLARE_PIXELS,
    sizeAttenuation: false,
    blending: AdditiveBlending,
    depthWrite: false,
    transparent: true,
    opacity: isStar ? 1 : 0.85,
  });

  const points = new Points(geometry, material);
  points.frustumCulled = false;
  return points;
}
