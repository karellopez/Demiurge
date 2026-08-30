import type { HostCapabilities } from '@features/diagnostics/ports';

/** A capable machine, used as the base every fixture overrides from. */
const CAPABLE_MACHINE: HostCapabilities = {
  rendererDescription: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
  deviceMemoryGiB: 16,
  hardwareConcurrency: 12,
  supportsWebGL2: true,
  microBenchmarkScore: undefined,
};

/**
 * Builds a host-capability record, overriding only what a test cares about.
 *
 * @param overrides - The fields this test is actually about.
 * @returns A complete capability record.
 */
export function aHost(overrides: Partial<HostCapabilities> = {}): HostCapabilities {
  return { ...CAPABLE_MACHINE, ...overrides };
}
