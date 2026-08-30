/**
 * The GPU identification tables.
 *
 * Data, kept apart from the policy that reads it in `detect-quality-tier.ts`.
 * These lists will churn constantly — every new GPU generation adds a string —
 * whereas the rules that weigh them should not, so a change to one is never a
 * change to the other.
 *
 * Matching is on a lower-cased substring of the unmasked renderer description,
 * which in practice looks like
 * `ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)`.
 *
 * @module
 */

/** Fragments that identify integrated or otherwise weak GPUs. */
const WEAK_GPU_MARKERS = [
  'uhd graphics',
  'hd graphics',
  'gma',
  'llvmpipe',
  'swiftshader',
  'software',
  'microsoft basic render',
  'apple gpu (software)',
] as const;

/** Fragments that identify a mid-range discrete or modern integrated GPU. */
const MIDRANGE_GPU_MARKERS = [
  'iris',
  'vega',
  'radeon graphics',
  'gtx 10',
  'gtx 16',
  'mx',
  'apple m1',
  'adreno',
] as const;

/** Fragments that identify a GPU comfortably above the Medium target. */
const STRONG_GPU_MARKERS = [
  'rtx',
  'radeon rx',
  'arc a',
  'apple m2',
  'apple m3',
  'apple m4',
  'quadro',
] as const;

/** How strong a renderer string says the GPU is. */
export type GpuClass = 'weak' | 'midrange' | 'strong';

/**
 * Reports whether any marker appears in the renderer description.
 *
 * @param description - Lower-cased renderer description.
 * @param markers - Fragments to look for.
 * @returns True when at least one marker matches.
 */
function hasAnyMarker(description: string, markers: readonly string[]): boolean {
  return markers.some((marker) => description.includes(marker));
}

/**
 * Classifies a GPU from its renderer string.
 *
 * The lists are checked weakest first, because a string can legitimately match
 * more than one — "Radeon RX Vega 64" carries both a midrange and a strong
 * marker — and guessing upward is the expensive mistake.
 *
 * @param rendererDescription - The unmasked renderer string, possibly empty.
 * @returns The class, or `undefined` when the string is empty or unrecognised.
 */
export function classifyGpu(rendererDescription: string): GpuClass | undefined {
  const description = rendererDescription.toLowerCase();
  if (description === '') {
    return undefined;
  }
  if (hasAnyMarker(description, WEAK_GPU_MARKERS)) {
    return 'weak';
  }
  if (hasAnyMarker(description, MIDRANGE_GPU_MARKERS)) {
    return 'midrange';
  }
  if (hasAnyMarker(description, STRONG_GPU_MARKERS)) {
    return 'strong';
  }
  return undefined;
}
