/**
 * Choosing a starting quality tier for the machine we booted on.
 *
 * Tier detection is guesswork dressed up as measurement, and it is treated that
 * way here: the result is a *starting* tier with a reason attached, always
 * overridable in settings without a reload, and always superseded later by the
 * adaptive controller once real frame times exist. What this code must get right
 * is the floor — misjudging an RTX 3060 as Medium costs a little fidelity, but
 * misjudging a UHD 620 as High costs a slideshow before the player ever reaches
 * the settings menu. Every ambiguous signal therefore rounds downward.
 *
 * The GPU name tables live in `gpu-markers.ts`; this file is only the policy
 * that weighs them against the CPU, the memory and the micro-benchmark.
 *
 * @module
 */

import { QualityTier } from '@domain/quality-tier';

import { classifyGpu, type GpuClass } from './gpu-markers';
import type { HostCapabilities, TierSelection } from './ports';

/** Below this many logical cores the worker pool cannot keep terrain fed. */
const MINIMUM_CORES_FOR_LOW = 4;

/** Below this much reported memory, texture budgets have to stay at the floor. */
const MINIMUM_MEMORY_GIB_FOR_MEDIUM = 8;

/** Micro-benchmark score under which the GPU is treated as Potato regardless. */
const MICRO_BENCHMARK_POTATO_CEILING = 0.25;

/** Micro-benchmark score above which the GPU is allowed to reach High. */
const MICRO_BENCHMARK_HIGH_FLOOR = 3;

/**
 * The tier each GPU class starts at.
 *
 * An unrecognised GPU is deliberately absent: it is treated as `Low` at the call
 * site, on the reasoning that assuming a stranger is fast costs far more than
 * assuming it is ordinary.
 */
const TIER_FOR_GPU_CLASS: Readonly<Record<GpuClass, QualityTier>> = {
  weak: QualityTier.Potato,
  midrange: QualityTier.Low,
  strong: QualityTier.High,
} as const;

/**
 * Applies the CPU and memory ceilings that no GPU can lift.
 *
 * A fast GPU behind two cores still cannot stream terrain, and 4 GiB of system
 * memory cannot hold a Medium texture budget, so these clamp rather than vote.
 *
 * @param tier - The tier suggested so far.
 * @param capabilities - The reported machine capabilities.
 * @returns The tier, lowered if the machine cannot support it.
 */
function clampToSystemLimits(tier: QualityTier, capabilities: HostCapabilities): QualityTier {
  const hasTooFewCores = capabilities.hardwareConcurrency < MINIMUM_CORES_FOR_LOW;
  const afterCores = hasTooFewCores ? QualityTier.Potato : tier;

  const memory = capabilities.deviceMemoryGiB;
  const isMemoryKnownAndSmall = memory !== undefined && memory < MINIMUM_MEMORY_GIB_FOR_MEDIUM;
  const requiresMoreMemoryThanReported =
    isMemoryKnownAndSmall && (afterCores === QualityTier.Medium || afterCores === QualityTier.High);

  return requiresMoreMemoryThanReported ? QualityTier.Low : afterCores;
}

/**
 * Applies the GPU micro-benchmark, which outranks the renderer string.
 *
 * The name is a label the driver chose; the benchmark is a measurement. It is
 * allowed to demote any tier and to promote only as far as High.
 *
 * @param tier - The tier suggested so far.
 * @param score - Micro-benchmark score, or `undefined` when it did not run.
 * @returns The adjusted tier.
 */
function applyMicroBenchmark(tier: QualityTier, score: number | undefined): QualityTier {
  if (score === undefined) {
    return tier;
  }
  if (score < MICRO_BENCHMARK_POTATO_CEILING) {
    return QualityTier.Potato;
  }
  if (score >= MICRO_BENCHMARK_HIGH_FLOOR && tier !== QualityTier.Potato) {
    return QualityTier.High;
  }
  return tier;
}

/**
 * Describes the GPU for the reason string.
 *
 * @param rendererDescription - The renderer string, possibly withheld.
 * @returns The GPU name, or a phrase admitting it was not disclosed.
 */
function describeGpu(rendererDescription: string): string {
  return rendererDescription === '' ? 'an unnamed GPU' : rendererDescription;
}

/**
 * Describes the reported memory for the reason string.
 *
 * @param deviceMemoryGiB - Reported memory, or `undefined`.
 * @returns A phrase naming the memory or admitting it was not disclosed.
 */
function describeMemory(deviceMemoryGiB: number | undefined): string {
  return deviceMemoryGiB === undefined
    ? 'undisclosed memory'
    : `${String(deviceMemoryGiB)} GiB reported memory`;
}

/**
 * Describes the micro-benchmark for the reason string.
 *
 * @param score - The score, or `undefined` when it has not run yet.
 * @returns A phrase naming the score or admitting there is none.
 */
function describeBenchmark(score: number | undefined): string {
  return score === undefined ? 'no GPU benchmark' : `GPU benchmark ${score.toFixed(2)}`;
}

/**
 * Builds the plain-language explanation shown in settings.
 *
 * @param tier - The tier that was chosen.
 * @param capabilities - The capabilities it was chosen from.
 * @returns One sentence naming the deciding evidence.
 */
function explain(tier: QualityTier, capabilities: HostCapabilities): string {
  if (!capabilities.supportsWebGL2) {
    return 'WebGL2 is unavailable, so the lowest tier is assumed.';
  }

  const parts = [
    describeGpu(capabilities.rendererDescription),
    `${String(capabilities.hardwareConcurrency)} logical cores`,
    describeMemory(capabilities.deviceMemoryGiB),
    describeBenchmark(capabilities.microBenchmarkScore),
  ];

  return `Selected ${tier} from ${parts.join(', ')}.`;
}

/**
 * Chooses the tier this machine should start at.
 *
 * Pure: given the same capabilities it returns the same selection, which is what
 * lets the whole tier table be covered by unit tests.
 *
 * @param capabilities - What the host reported about itself.
 * @returns The starting tier and the reason for it.
 */
export function detectQualityTier(capabilities: HostCapabilities): TierSelection {
  if (!capabilities.supportsWebGL2) {
    return { tier: QualityTier.Potato, reason: explain(QualityTier.Potato, capabilities) };
  }

  const gpuClass = classifyGpu(capabilities.rendererDescription);
  const fromRenderer = gpuClass === undefined ? QualityTier.Low : TIER_FOR_GPU_CLASS[gpuClass];
  const afterBenchmark = applyMicroBenchmark(fromRenderer, capabilities.microBenchmarkScore);
  const tier = clampToSystemLimits(afterBenchmark, capabilities);

  return { tier, reason: explain(tier, capabilities) };
}
