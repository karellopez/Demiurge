/**
 * A body in the simulation, and the tree they form.
 *
 * The catalogue on disk is written for a person to audit: degrees, kilometres,
 * two different orbital element conventions, and a citation on every orbit. What
 * the simulation wants is one convention, in SI, in radians. This module is that
 * conversion, and the type it produces is what every other layer sees.
 *
 * @module
 */

import type { OrbitalElements } from '@domain/orbits/elements';
import { type Days, type GravitationalParameter, type Meters, type Radians } from '@shared/units';

/** What sort of thing a body is. Drives rendering and the body browser's grouping. */
export type BodyKind = 'star' | 'planet' | 'dwarf-planet' | 'moon';

/** A ring system, as an annulus in the equatorial plane. */
export interface RingGeometry {
  /** Inner edge, measured from the body's centre. */
  readonly innerRadius: Meters;
  /** Outer edge, measured from the body's centre. */
  readonly outerRadius: Meters;
}

/**
 * How a body is oriented and how it spins.
 *
 * The pole is given as a direction in the J2000 equatorial frame, which is how
 * the IAU publishes it. `primeMeridian` and its rate are what make a surface
 * feature appear at the right longitude on the right date — without them a
 * planet is a sphere spinning at the right speed but with no defined phase, and
 * the terminator falls in the wrong place.
 */
interface RotationModel {
  /** Right ascension of the north pole at J2000. */
  readonly poleRightAscension: Radians;
  /** Declination of the north pole at J2000. */
  readonly poleDeclination: Radians;
  /** Angle of the prime meridian at J2000. */
  readonly primeMeridian: Radians;
  /** Rate of change of the prime meridian. Negative for retrograde rotation. */
  readonly primeMeridianRate: Radians;
  /** Sidereal rotation period. Negative for retrograde rotation. */
  readonly rotationPeriod: Days;
}

/** Everything the simulation knows about one body. */
export interface Body {
  /** Stable machine identifier, used in save files. */
  readonly id: string;
  /** Display name. */
  readonly name: string;
  /** What sort of body this is. */
  readonly kind: BodyKind;
  /** The body this one orbits, or `undefined` for the root of the system. */
  readonly parentId: string | undefined;
  /** Equatorial radius. */
  readonly equatorialRadius: Meters;
  /** Polar radius. Smaller than the equatorial radius on an oblate body. */
  readonly polarRadius: Meters;
  /** Standard gravitational parameter, GM. */
  readonly gravitationalParameter: GravitationalParameter;
  /** How the body is oriented and how it spins. */
  readonly rotation: RotationModel;
  /** Bond albedo, roughly. Used to set surface brightness before textures exist. */
  readonly albedo: number;
  /** Ring system, when the body has one. */
  readonly rings: RingGeometry | undefined;
  /** Orbit about the parent, or `undefined` for the root. */
  readonly orbit: OrbitalElements | undefined;
}

/** The whole catalogue, indexed for the lookups the simulation actually does. */
export interface BodyCatalog {
  /** Every body, in catalogue order. */
  readonly all: readonly Body[];
  /**
   * Finds a body by id.
   *
   * @param id - The body's stable identifier.
   * @returns The body, or `undefined` when nothing matches.
   */
  byId(id: string): Body | undefined;
  /**
   * Lists the bodies orbiting a given one.
   *
   * @param id - The parent's identifier.
   * @returns Its direct satellites, in catalogue order.
   */
  childrenOf(id: string): readonly Body[];
  /**
   * Lists a body's ancestors, nearest first.
   *
   * Walking to the root is how a moon's heliocentric position is assembled: its
   * own orbit about its planet, plus the planet's about the Sun.
   *
   * @param id - The body's identifier.
   * @returns The chain of parents, ending at the root.
   */
  ancestorsOf(id: string): readonly Body[];
  /** The root of the system, which everything else ultimately orbits. */
  readonly root: Body;
}

/**
 * Computes a body's flattening, the measure of how far from spherical it is.
 *
 * Saturn's is about 0.098, which is very visible; Earth's is 0.0034, which is
 * not. Worth having as a number so the renderer scales rather than guesses.
 *
 * @param body - The body to measure.
 * @returns `(equatorial − polar) / equatorial`, so 0 is a sphere.
 */
export function flattening(body: Body): number {
  return (body.equatorialRadius - body.polarRadius) / body.equatorialRadius;
}

/**
 * Computes surface gravity at the equator.
 *
 * Shown on the body's stats card, and the number the character controller uses
 * once there is one to walk with — a jump on the Moon has to feel like a jump on
 * the Moon.
 *
 * @param body - The body to measure.
 * @returns Acceleration at the equatorial surface, in m/s².
 */
export function surfaceGravity(body: Body): number {
  const radiusMeters = body.equatorialRadius;
  // GM is catalogued in km^3/s^2; the conversion to m^3/s^2 is 1e9.
  return (body.gravitationalParameter * 1e9) / (radiusMeters * radiusMeters);
}
