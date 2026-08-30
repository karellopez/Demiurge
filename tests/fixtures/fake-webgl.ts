import { vi } from 'vitest';

/** The subset of WebGL2 the capability probe actually touches. */
interface FakeGl {
  readonly RENDERER: number;
  getExtension: (name: string) => unknown;
  getParameter: (parameter: number) => unknown;
}

/** How a fake context should behave. */
export interface FakeGlOptions {
  /** Renderer string returned through `WEBGL_debug_renderer_info`. */
  readonly rendererDescription?: string;
  /** When true, the debug-renderer-info extension is withheld, as privacy modes do. */
  readonly withholdsRendererInfo?: boolean;
  /** When true, `getContext` returns null, as a browser without WebGL2 does. */
  readonly refusesContext?: boolean;
  /** When true, `getContext` throws, as some locked-down configurations do. */
  readonly throwsOnContext?: boolean;
}

const UNMASKED_RENDERER = 0x92_46;
const PLAIN_RENDERER = 0x1f_01;

/**
 * Installs a fake `getContext` on the document's canvas prototype.
 *
 * happy-dom has no WebGL implementation, so the probe is exercised against a
 * stub that reproduces the three behaviours that matter: a working context, a
 * context that withholds its renderer name, and no context at all.
 *
 * @param options - How the fake context should behave.
 * @returns A record of whether the context was asked to release itself.
 */
export function installFakeWebGl(options: FakeGlOptions = {}): { wasReleased: () => boolean } {
  let isReleased = false;

  const gl: FakeGl = {
    RENDERER: PLAIN_RENDERER,
    getExtension: (name: string): unknown => {
      if (name === 'WEBGL_lose_context') {
        return {
          loseContext: (): void => {
            isReleased = true;
          },
        };
      }
      if (name === 'WEBGL_debug_renderer_info') {
        return options.withholdsRendererInfo === true
          ? null
          : { UNMASKED_RENDERER_WEBGL: UNMASKED_RENDERER };
      }
      return null;
    },
    getParameter: (parameter: number): unknown => {
      if (parameter === UNMASKED_RENDERER) {
        return options.rendererDescription ?? 'FakeGPU 9000';
      }
      // A browser that withholds debug info still answers `RENDERER`, but with a
      // deliberately generic string.
      return parameter === PLAIN_RENDERER ? 'WebKit WebGL' : undefined;
    },
  };

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((): unknown => {
    if (options.throwsOnContext === true) {
      throw new Error('context creation blocked by policy');
    }
    return options.refusesContext === true ? null : gl;
  }) as HTMLCanvasElement['getContext']);

  return { wasReleased: (): boolean => isReleased };
}
