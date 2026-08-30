/**
 * The composition root: the one place concrete classes meet.
 *
 * Every dependency in the project is passed in through a constructor or a
 * factory argument, and every one of those wires is tied here. There is no
 * service locator, no global singleton and no module-level mutable state, so
 * reading this file tells you the entire shape of the running program.
 *
 * @module
 */

import { resolveSessionSeed } from '@domain/session-seed';
import { detectQualityTier } from '@features/diagnostics/detect-quality-tier';
import type { DiagnosticsSink } from '@features/diagnostics/ports';
import { createEngine, type Engine } from '@features/engine/engine';
import {
  createAnimationFrameScheduler,
  createPerformanceClock,
} from '@presentation/render/browser-frame-loop';
import { createPrecisionScene } from '@presentation/render/precision-scene';
import { probeHostCapabilities } from '@presentation/render/webgl-host-capabilities';
import {
  combineDiagnosticsSinks,
  createConsoleDiagnosticsSink,
  mountBootScreen,
} from '@presentation/ui/boot-screen';
import { mountStatsOverlay, type StatsOverlay } from '@presentation/ui/stats-overlay';
import { err, ok, type Result } from '@shared/result';

/** Why start-up could not proceed. Expected failures, not programmer errors. */
export type BootFailure =
  | { readonly kind: 'missing-mount-point'; readonly selector: string }
  | { readonly kind: 'webgl2-unavailable' };

/** Everything the caller needs to hand `startApplication` its outside world. */
export interface BootOptions {
  /** CSS selector for the element the UI mounts into. */
  readonly mountSelector: string;
  /**
   * The seed for this session, normally read from the URL hash. Omitted when the
   * player has not chosen one, in which case the default universe is loaded.
   */
  readonly requestedSeed?: string | undefined;
  /**
   * Whether to start the render loop. The integration tests mount the UI in a
   * DOM without a GPU and only check the wiring, so they leave this off.
   */
  readonly startRenderLoop?: boolean;
}

/** A started application, and the handle needed to tear it down again. */
export interface RunningApplication {
  /** The tier the session started at. */
  readonly tier: string;
  /** The canonical seed this universe was generated from. */
  readonly seedPhrase: string;
  /** The statistics overlay, so `F3` can toggle it. */
  readonly stats: StatsOverlay;
  /** The engine, or `undefined` when the render loop was not started. */
  readonly engine: Engine | undefined;
  /** Releases everything the application holds. */
  dispose(): void;
}

/**
 * Reads the session seed out of a URL hash such as `#seed=cobalt%20meridian`.
 *
 * A configuration being a shareable link is a product requirement, so the seed
 * lives in the URL rather than only in storage.
 *
 * @param hash - The `location.hash` value, with or without its leading `#`.
 * @returns The requested seed, or `undefined` when the hash carries none.
 */
export function readSeedFromHash(hash: string): string | undefined {
  const parameters = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  return parameters.get('seed') ?? undefined;
}

/**
 * Creates the canvas the scene renders into.
 *
 * @param host - The element to append it to.
 * @returns The canvas.
 */
function createSceneCanvas(host: HTMLElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.className = 'scene';
  host.append(canvas);
  return canvas;
}

/**
 * Wires and starts the application.
 *
 * @param options - The mount point, the requested seed, and whether to render.
 * @returns The running application, or the reason it could not start.
 */
export function startApplication(options: BootOptions): Result<RunningApplication, BootFailure> {
  const host = document.querySelector<HTMLElement>(options.mountSelector);
  if (host === null) {
    return err({ kind: 'missing-mount-point', selector: options.mountSelector });
  }

  const capabilities = probeHostCapabilities();
  if (!capabilities.supportsWebGL2) {
    return err({ kind: 'webgl2-unavailable' });
  }

  const session = resolveSessionSeed(options.requestedSeed);
  const selection = detectQualityTier(capabilities);

  const sink: DiagnosticsSink = combineDiagnosticsSinks([
    mountBootScreen(host),
    createConsoleDiagnosticsSink(),
  ]);
  sink.report({ selection, capabilities, seedPhrase: session.phrase });

  const clock = createPerformanceClock();
  const stats = mountStatsOverlay(host, selection.tier, () => clock.nowSeconds() * 1000);

  const engine = options.startRenderLoop
    ? createEngine({
        clock,
        scheduler: createAnimationFrameScheduler(),
        scene: createPrecisionScene(createSceneCanvas(host)),
        stats,
      })
    : undefined;
  engine?.start();

  return ok({
    tier: selection.tier,
    seedPhrase: session.phrase,
    stats,
    engine,
    dispose(): void {
      engine?.stop();
      stats.dispose();
      host.replaceChildren();
    },
  });
}

/**
 * Renders a start-up failure as something a person can act on.
 *
 * A blank page with a console stack trace is the worst possible outcome on a
 * static host, so every expected failure gets a readable message on screen.
 *
 * @param failure - The reason start-up stopped.
 * @returns A sentence explaining what happened and what to try.
 */
export function describeBootFailure(failure: BootFailure): string {
  switch (failure.kind) {
    case 'missing-mount-point': {
      return `Demiurge could not start: no element matched "${failure.selector}".`;
    }
    case 'webgl2-unavailable': {
      return 'Demiurge needs WebGL2, which this browser did not provide. Try a current Chrome, Edge, Firefox or Safari, and check that hardware acceleration is enabled.';
    }
  }
}
