/**
 * Adapter: reads real host capabilities out of the browser.
 *
 * This is the only place in the project allowed to ask the platform what it is.
 * Everything downstream consumes the normalised {@link HostCapabilities} record,
 * which is why the tier rules can be tested without a GPU.
 *
 * The probe is deliberately defensive. `WEBGL_debug_renderer_info` is absent or
 * spoofed in privacy-hardened browsers, `deviceMemory` is Chromium-only, and
 * context creation itself throws on some locked-down configurations. None of
 * those is an error worth reporting to the player — each simply narrows what we
 * know, and an unknown signal must never be read as a strong one.
 *
 * @module
 */

import type { HostCapabilities } from '@features/diagnostics/ports';

/** Shape of the Chromium-only `navigator.deviceMemory` extension. */
interface NavigatorWithDeviceMemory extends Navigator {
  readonly deviceMemory?: number;
}

/**
 * Reads the unmasked renderer string when the browser is willing to give it.
 *
 * @param gl - A live WebGL2 context.
 * @returns The renderer description, or an empty string when withheld.
 */
function readRendererDescription(gl: WebGL2RenderingContext): string {
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const parameter = debugInfo?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER;
  const value: unknown = gl.getParameter(parameter);
  return typeof value === 'string' ? value : '';
}

/**
 * Creates a throwaway WebGL2 context for probing.
 *
 * @returns The context, or `undefined` when WebGL2 is unavailable.
 */
function createProbeContext(): WebGL2RenderingContext | undefined {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    // `failIfMajorPerformanceCaveat` would reject software renderers outright,
    // but the project supports them at Potato, so the caveat is measured rather
    // than refused.
    return canvas.getContext('webgl2', { powerPreference: 'high-performance' }) ?? undefined;
  } catch (error) {
    console.warn('WebGL2 probe could not create a context; assuming it is unavailable.', error);
    return undefined;
  }
}

/**
 * Releases a probe context immediately rather than waiting for collection.
 *
 * Browsers cap live WebGL contexts at a low number, and the real renderer needs
 * one, so the probe must not hold on to its own.
 *
 * @param gl - The context to discard.
 */
function releaseProbeContext(gl: WebGL2RenderingContext): void {
  gl.getExtension('WEBGL_lose_context')?.loseContext();
}

/**
 * Reads the logical core count, floored at one.
 *
 * @returns A core count of at least 1.
 */
function readHardwareConcurrency(): number {
  const reported = navigator.hardwareConcurrency;
  return Number.isFinite(reported) && reported > 0 ? reported : 1;
}

/**
 * Reads reported device memory where the browser exposes it.
 *
 * @returns Memory in gibibytes, or `undefined` when not exposed.
 */
function readDeviceMemoryGiB(): number | undefined {
  const extended = navigator as NavigatorWithDeviceMemory;
  const reported = extended.deviceMemory;
  return typeof reported === 'number' && reported > 0 ? reported : undefined;
}

/**
 * Probes the host machine for everything tier selection needs.
 *
 * The GPU micro-benchmark is not run here; it needs the real renderer and its
 * shader pipeline, so it is measured behind the title screen and folded in
 * later. Until then the score is reported as unknown, which the tier rules treat
 * as "no opinion" rather than as a low score.
 *
 * @returns The normalised capability record.
 */
export function probeHostCapabilities(): HostCapabilities {
  const gl = createProbeContext();

  if (gl === undefined) {
    return {
      rendererDescription: '',
      deviceMemoryGiB: readDeviceMemoryGiB(),
      hardwareConcurrency: readHardwareConcurrency(),
      supportsWebGL2: false,
      microBenchmarkScore: undefined,
    };
  }

  const rendererDescription = readRendererDescription(gl);
  releaseProbeContext(gl);

  return {
    rendererDescription,
    deviceMemoryGiB: readDeviceMemoryGiB(),
    hardwareConcurrency: readHardwareConcurrency(),
    supportsWebGL2: true,
    microBenchmarkScore: undefined,
  };
}
