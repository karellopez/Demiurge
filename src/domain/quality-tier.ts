/**
 * Quality tiers and the per-tier budgets everything else is measured against.
 *
 * The weakest tier is the design target, not a fallback: a feature that cannot
 * degrade onto `Potato` does not ship. Keeping the budgets here — in pure domain
 * code with no renderer attached — means the terrain streamer, the post-process
 * graph and the benchmark harness all read the same numbers, and a test can
 * assert against them without standing up a WebGL context.
 *
 * @module
 */

import { type Meters, meters } from '@shared/units';

/**
 * The four hardware classes the project targets.
 *
 * Ordered weakest to strongest; the adaptive quality controller steps along this
 * ladder and never past its ends.
 */
export enum QualityTier {
  /** Intel UHD 620 class. 1366x768, 30 fps locked, no frame over 50 ms. */
  Potato = 'potato',
  /** Intel Iris Xe / Vega 8 class. 1080p, 60 fps, p95 under 18 ms. */
  Low = 'low',
  /** GTX 1650 / M1 class. 1080p, 60 fps, p95 under 14 ms. */
  Medium = 'medium',
  /** RTX 3060 and above. 1440p, 60 fps, p95 under 12 ms. */
  High = 'high',
}

/** Weakest-to-strongest tier order, for stepping the adaptive quality ladder. */
export const QUALITY_TIER_ORDER = [
  QualityTier.Potato,
  QualityTier.Low,
  QualityTier.Medium,
  QualityTier.High,
] as const;

/** The frame-time and resource budget a tier must hold to. */
export interface TierBudget {
  /** Frame rate the tier is expected to sustain. */
  readonly targetFramesPerSecond: number;
  /** 95th-percentile frame time, in milliseconds, that the benchmark gates on. */
  readonly frameTimeP95Ms: number;
  /** Hard ceiling on any single frame, in milliseconds. A stutter above this fails. */
  readonly worstFrameMs: number;
  /** Maximum draw calls per frame. The stats overlay turns red above it. */
  readonly maxDrawCalls: number;
  /** Texture memory ceiling, in mebibytes, above which the LRU cache evicts. */
  readonly textureBudgetMiB: number;
  /** Approximate terrain vertex spacing on an Earth-sized body. */
  readonly terrainVertexSpacing: Meters;
}

/**
 * The budget table.
 *
 * Sourced from the performance targets in the project brief; every number here
 * is an acceptance criterion measured by `npm run bench:flythrough`, not a hint.
 */
export const TIER_BUDGETS: Readonly<Record<QualityTier, TierBudget>> = {
  [QualityTier.Potato]: {
    targetFramesPerSecond: 30,
    frameTimeP95Ms: 33.3,
    worstFrameMs: 50,
    maxDrawCalls: 400,
    textureBudgetMiB: 128,
    terrainVertexSpacing: meters(2),
  },
  [QualityTier.Low]: {
    targetFramesPerSecond: 60,
    frameTimeP95Ms: 18,
    worstFrameMs: 50,
    maxDrawCalls: 700,
    textureBudgetMiB: 256,
    terrainVertexSpacing: meters(1),
  },
  [QualityTier.Medium]: {
    targetFramesPerSecond: 60,
    frameTimeP95Ms: 14,
    worstFrameMs: 40,
    maxDrawCalls: 1100,
    textureBudgetMiB: 512,
    terrainVertexSpacing: meters(0.5),
  },
  [QualityTier.High]: {
    targetFramesPerSecond: 60,
    frameTimeP95Ms: 12,
    worstFrameMs: 33,
    maxDrawCalls: 1500,
    textureBudgetMiB: 1024,
    terrainVertexSpacing: meters(0.5),
  },
} as const;

/**
 * Looks up the budget for a tier.
 *
 * @param tier - The tier to describe.
 * @returns That tier's budget.
 */
export function budgetFor(tier: QualityTier): TierBudget {
  return TIER_BUDGETS[tier];
}

/**
 * Each tier's weaker neighbour, saturating at the floor.
 *
 * Written out rather than derived by index arithmetic so the lookup is total:
 * `Record<QualityTier, QualityTier>` will not compile until a newly added tier
 * declares its neighbours, and there is no unreachable bounds-check branch for
 * a test to have to pretend to cover.
 */
const WEAKER_NEIGHBOUR: Readonly<Record<QualityTier, QualityTier>> = {
  [QualityTier.Potato]: QualityTier.Potato,
  [QualityTier.Low]: QualityTier.Potato,
  [QualityTier.Medium]: QualityTier.Low,
  [QualityTier.High]: QualityTier.Medium,
} as const;

/** Each tier's stronger neighbour, saturating at the ceiling. */
const STRONGER_NEIGHBOUR: Readonly<Record<QualityTier, QualityTier>> = {
  [QualityTier.Potato]: QualityTier.Low,
  [QualityTier.Low]: QualityTier.Medium,
  [QualityTier.Medium]: QualityTier.High,
  [QualityTier.High]: QualityTier.High,
} as const;

/**
 * Returns the next tier down, or the same tier if already at the floor.
 *
 * The adaptive controller calls this when the 95th-percentile frame time has sat
 * over budget long enough to be a trend rather than a hitch.
 *
 * @param tier - The current tier.
 * @returns The adjacent weaker tier, or `Potato` if there is none.
 */
export function weakerTier(tier: QualityTier): QualityTier {
  return WEAKER_NEIGHBOUR[tier];
}

/**
 * Returns the next tier up, or the same tier if already at the ceiling.
 *
 * @param tier - The current tier.
 * @returns The adjacent stronger tier, or `High` if there is none.
 */
export function strongerTier(tier: QualityTier): QualityTier {
  return STRONGER_NEIGHBOUR[tier];
}

/**
 * Reports whether a measured frame time is inside a tier's budget.
 *
 * @param tier - The tier being held to.
 * @param frameTimeP95Ms - Measured 95th-percentile frame time, in milliseconds.
 * @returns True when the measurement is within budget.
 */
export function isWithinFrameBudget(tier: QualityTier, frameTimeP95Ms: number): boolean {
  return frameTimeP95Ms <= TIER_BUDGETS[tier].frameTimeP95Ms;
}
