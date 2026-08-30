/**
 * Scale: making a system that is mostly empty space legible.
 *
 * At true scale the solar system is almost entirely nothing. If Earth were a
 * pixel, the Sun would be a centimetre across and four metres away, and Neptune
 * would be off the end of a tennis court. That is the truth, it is the default,
 * and it is also why every orrery ever built lies about it.
 *
 * So there are two independent exaggerations:
 *
 * - `distanceScale` shrinks the *gaps*, from 1 (true) down to 0.001. Compressing
 *   distance brings the outer planets into frame.
 * - `sizeScale` inflates the *bodies*, from 1 (true) up to 1000. Inflating size
 *   makes a planet something you can see rather than infer.
 *
 * The critical property, and the reason this module is pure domain code with no
 * renderer anywhere near it: **scale is a rendering transform, never a
 * simulation one.** Positions, orbits, gravity and collision are always computed
 * in true metres. Scale is applied once, at the floating-origin boundary, on the
 * way to the GPU. That is what makes the brief's requirement — that changing
 * scale must never break orbits, cameras, landing or collision — true by
 * construction rather than by vigilance.
 *
 * Because the transform is linear about the system's origin, scaling the whole
 * universe and then subtracting the camera is the same as subtracting the camera
 * and then scaling: `s·a − s·b = s·(a − b)`. So applying it costs one multiply
 * on a number that is already being computed.
 *
 * @module
 */

/** How the world is exaggerated for display. */
export interface ScaleSettings {
  /** Multiplies every distance from the system origin. 1 is true scale. */
  readonly distanceScale: number;
  /** Multiplies every body radius. 1 is true scale. */
  readonly sizeScale: number;
}

/** Smallest distance compression offered. Below this the system is a point. */
export const MIN_DISTANCE_SCALE = 0.001;

/** Distances are never stretched, only compressed. */
export const MAX_DISTANCE_SCALE = 1;

/** Bodies are never shrunk, only inflated. */
export const MIN_SIZE_SCALE = 1;

/** Largest body inflation offered. Beyond this the inner planets overlap. */
export const MAX_SIZE_SCALE = 1000;

/** A named combination of the two exaggerations. */
export interface ScalePreset {
  /** Stable identifier, used in the URL and in saved settings. */
  readonly id: 'true' | 'orrery' | 'textbook';
  /** How it appears in the parameter panel. */
  readonly label: string;
  /** One plain-language line explaining what it does to the view. */
  readonly description: string;
  /** The settings it selects. */
  readonly settings: ScaleSettings;
}

/**
 * The three presets.
 *
 * They are not arbitrary. `true` is the default and the honest one. `orrery`
 * compresses distance enough to hold the outer system in one view while keeping
 * bodies recognisable. `textbook` is the diagram from a school wall: distances
 * crushed, bodies enormous, nothing to scale and everything visible.
 */
export const SCALE_PRESETS: readonly ScalePreset[] = [
  {
    id: 'true',
    label: 'True scale',
    description: 'Real sizes and real distances. Planets are specks; that is the point.',
    settings: { distanceScale: 1, sizeScale: 1 },
  },
  {
    id: 'orrery',
    label: 'Orrery',
    description: 'Distances compressed and bodies enlarged, so the whole system fits one view.',
    settings: { distanceScale: 0.08, sizeScale: 120 },
  },
  {
    id: 'textbook',
    label: 'Textbook',
    description:
      'The diagram from a classroom wall. Nothing is to scale and everything is visible.',
    settings: { distanceScale: 0.01, sizeScale: 900 },
  },
] as const;

/** True scale, which is where a session starts. */
export const TRUE_SCALE: ScaleSettings = { distanceScale: 1, sizeScale: 1 };

/**
 * Clamps settings into the ranges the parameter panel offers.
 *
 * A saved configuration arrives from a URL, where anything can be typed. Clamping
 * rather than rejecting means a malformed link still shows a solar system.
 *
 * @param settings - Possibly out-of-range settings.
 * @returns Settings inside the offered ranges.
 */
export function clampScale(settings: ScaleSettings): ScaleSettings {
  return {
    distanceScale: clamp(settings.distanceScale, MIN_DISTANCE_SCALE, MAX_DISTANCE_SCALE),
    sizeScale: clamp(settings.sizeScale, MIN_SIZE_SCALE, MAX_SIZE_SCALE),
  };
}

/**
 * Clamps one value, treating a non-finite input as the low end.
 *
 * @param value - The value to clamp.
 * @param low - Lower bound.
 * @param high - Upper bound.
 * @returns The clamped value.
 */
function clamp(value: number, low: number, high: number): number {
  if (!Number.isFinite(value)) {
    return low;
  }
  return Math.min(high, Math.max(low, value));
}

/**
 * Interpolates between two scale settings.
 *
 * Both parameters are exponential in feel — the difference between 0.01 and 0.02
 * is enormous, and between 0.9 and 0.91 is nothing — so the interpolation is
 * geometric rather than linear. A linear sweep from true scale to textbook would
 * spend most of its time looking almost exactly like true scale and then lurch.
 *
 * @param from - The starting settings.
 * @param to - The destination settings.
 * @param t - Progress, clamped into [0, 1].
 * @returns The settings partway between.
 */
export function interpolateScale(from: ScaleSettings, to: ScaleSettings, t: number): ScaleSettings {
  const progress = clamp(t, 0, 1);
  return {
    distanceScale: geometricLerp(from.distanceScale, to.distanceScale, progress),
    sizeScale: geometricLerp(from.sizeScale, to.sizeScale, progress),
  };
}

/**
 * Interpolates geometrically, so equal steps are equal ratios.
 *
 * @param from - Start value. Must be positive.
 * @param to - End value. Must be positive.
 * @param t - Progress in [0, 1].
 * @returns The value partway between, in log space.
 */
function geometricLerp(from: number, to: number, t: number): number {
  return from * (to / from) ** t;
}

/**
 * Reports whether the world is being shown at true scale.
 *
 * The HUD says so when it is not, because a player who has forgotten they left
 * the orrery preset on will otherwise measure something and get a wrong answer.
 *
 * @param settings - The settings to inspect.
 * @returns True when nothing is exaggerated.
 */
export function isTrueScale(settings: ScaleSettings): boolean {
  return settings.distanceScale === 1 && settings.sizeScale === 1;
}

/**
 * Finds a preset by id.
 *
 * @param id - The preset's identifier.
 * @returns The preset, or `undefined` when no preset matches.
 */
export function presetById(id: string): ScalePreset | undefined {
  return SCALE_PRESETS.find((preset) => preset.id === id);
}
