/**
 * The camera modes, and what each is for.
 *
 * A camera in a solar system has to answer a question the player has not asked
 * out loud: *relative to what?* A planet is simultaneously spinning, orbiting,
 * and being lit from a direction that changes over its year. Each mode below
 * picks one of those to hold still, and holding a different thing still is the
 * whole difference between them.
 *
 * @module
 */

/** How the camera holds itself relative to the body it is following. */
export enum CameraMode {
  /**
   * Orbits the body at a distance you control. Orientation follows the camera's
   * own position, so the body stays centred. The default, and the one that
   * behaves like every 3D viewer anyone has used.
   */
  Orbit = 'orbit',

  /**
   * Rides the body's rotating frame. A point on the surface stays under the
   * camera, so the terrain stops sliding past and the body appears still while
   * the stars wheel overhead. This is the view for watching a specific feature.
   */
  Locked = 'locked',

  /**
   * Keeps the orientation fixed against the stars while following the body's
   * position. The body rotates beneath a steady sky. This is the view for
   * telling how fast something actually spins.
   */
  Inertial = 'inertial',

  /**
   * Holds the Sun off to one side, so the terminator stays in frame. This is the
   * view for seeing relief: at local dawn every ridge throws a shadow the length
   * of a country, and the same ground at noon looks flat.
   */
  SunRelative = 'sun-relative',

  /**
   * A slow dolly with parallax, for looking rather than working. `H` hides the
   * HUD and this is what is left.
   */
  Cinematic = 'cinematic',
}

/** The order `C` cycles through. */
export const CAMERA_MODE_ORDER = [
  CameraMode.Orbit,
  CameraMode.Locked,
  CameraMode.Inertial,
  CameraMode.SunRelative,
  CameraMode.Cinematic,
] as const;

/** One line for the mode indicator, in the same plain-noun register as the HUD. */
export const CAMERA_MODE_LABELS: Readonly<Record<CameraMode, string>> = {
  [CameraMode.Orbit]: 'Orbit',
  [CameraMode.Locked]: 'Locked frame',
  [CameraMode.Inertial]: 'Inertial',
  [CameraMode.SunRelative]: 'Sun-relative',
  [CameraMode.Cinematic]: 'Cinematic',
};

/**
 * Returns the next mode in the cycle.
 *
 * @param mode - The current mode.
 * @returns The next one, wrapping at the end.
 */
export function nextCameraMode(mode: CameraMode): CameraMode {
  const index = CAMERA_MODE_ORDER.indexOf(mode);
  return CAMERA_MODE_ORDER[(index + 1) % CAMERA_MODE_ORDER.length] ?? CameraMode.Orbit;
}

/**
 * Reports whether a mode makes sense for the body being followed.
 *
 * Sun-relative is meaningless when the Sun *is* the followed body — there is no
 * terminator on a star, and the direction to the Sun is undefined at its centre.
 * Rather than showing a mode that quietly does nothing, the cycle skips it.
 *
 * @param mode - The mode being considered.
 * @param isFollowingStar - Whether the followed body is the system's star.
 * @returns True when the mode is meaningful here.
 */
export function isModeAvailable(mode: CameraMode, isFollowingStar: boolean): boolean {
  return !(isFollowingStar && mode === CameraMode.SunRelative);
}

/**
 * Returns the next mode that is meaningful for the followed body.
 *
 * @param mode - The current mode.
 * @param isFollowingStar - Whether the followed body is the system's star.
 * @returns The next available mode.
 */
export function nextAvailableCameraMode(mode: CameraMode, isFollowingStar: boolean): CameraMode {
  // Sun-relative is the only mode that is ever withheld, and it is never
  // adjacent to itself in the cycle, so one skip is always enough. If a second
  // mode ever becomes conditional this has to become a search, and the test
  // `skips an unavailable mode` is where that will be noticed.
  const candidate = nextCameraMode(mode);
  return isModeAvailable(candidate, isFollowingStar) ? candidate : nextCameraMode(candidate);
}
