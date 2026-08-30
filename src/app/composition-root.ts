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

import type { BodyCatalog } from '@domain/body';
import { resolveSessionSeed } from '@domain/session-seed';
import { INITIAL_TIME_SCALE, multiplierFor, type TimeScaleState } from '@domain/time-scale';
import { detectQualityTier } from '@features/diagnostics/detect-quality-tier';
import type { DiagnosticsSink } from '@features/diagnostics/ports';
import { createEngine, type Engine } from '@features/engine/engine';
import type { Clock, FrameStats, StatsSink } from '@features/engine/ports';
import { buildCatalog } from '@features/space/body-catalog';
import type { RawCatalog } from '@features/space/catalog-schema';
import {
  createAnimationFrameScheduler,
  createPerformanceClock,
} from '@presentation/render/browser-frame-loop';
import { createSolarSystemVisuals, placeVisual } from '@presentation/render/solar-system-scene';
import { createSpaceScene } from '@presentation/render/space-scene';
import { probeHostCapabilities } from '@presentation/render/webgl-host-capabilities';
import {
  combineDiagnosticsSinks,
  createConsoleDiagnosticsSink,
  mountBootScreen,
} from '@presentation/ui/boot-screen';
import { mountStatsOverlay, type StatsOverlay } from '@presentation/ui/stats-overlay';
import { mountTimeHud, type TimeHud } from '@presentation/ui/time-hud';
import { err, ok, type Result } from '@shared/result';

import rawCatalog from '../../data/bodies.json';

import type { BootFailure } from './boot-failure';

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
  /** How many bodies the catalogue loaded. */
  readonly bodyCount: number;
  /** The statistics overlay, so `F3` can toggle it. */
  readonly stats: StatsOverlay;
  /**
   * Clears the title screen.
   *
   * The simulation runs behind it from the first frame, so this is a curtain
   * rather than a loading gate. Phase 4 puts the shader warm-up progress here,
   * which is the point at which waiting for the player to press a key stops
   * being politeness and starts being useful.
   */
  dismissTitleScreen(): void;
  /** The engine, or `undefined` when the render loop was not started. */
  readonly engine: Engine | undefined;
  /**
   * Applies a new time-warp setting to both the engine and the readout.
   *
   * @param state - The new position on the ladder.
   */
  setTimeScale(state: TimeScaleState): void;
  /** Releases everything the application holds. */
  dispose(): void;
}

/**
 * Fans one frame's statistics out to several sinks.
 *
 * @param sinks - The sinks to notify.
 * @returns A sink that forwards to all of them.
 */
function combineStatsSinks(sinks: readonly StatsSink[]): StatsSink {
  return {
    publish(stats: FrameStats): void {
      for (const sink of sinks) {
        sink.publish(stats);
      }
    },
  };
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

/** The pieces of chrome the composition root mounts. */
interface MountedUi {
  readonly bootScreen: ReturnType<typeof mountBootScreen>;
  readonly stats: StatsOverlay;
  readonly timeHud: TimeHud;
}

/**
 * Mounts the interface and reports the boot diagnostics into it.
 *
 * @param host - The element everything mounts into.
 * @param report - What was settled at boot.
 * @param nowMs - Reads wall-clock milliseconds, for the throttled readouts.
 * @returns Handles for the mounted chrome.
 */
function mountUi(
  host: HTMLElement,
  report: Parameters<DiagnosticsSink['report']>[0],
  nowMs: () => number,
): MountedUi {
  const bootScreen = mountBootScreen(host);
  combineDiagnosticsSinks([bootScreen, createConsoleDiagnosticsSink()]).report(report);

  const stats = mountStatsOverlay(host, report.selection.tier, nowMs);
  const timeHud = mountTimeHud(host, report.seedPhrase, nowMs);
  timeHud.setTimeScale(INITIAL_TIME_SCALE);

  return { bootScreen, stats, timeHud };
}

/**
 * Builds and starts the engine.
 *
 * @param host - The element the scene canvas is appended to.
 * @param catalog - The bodies to simulate.
 * @param clock - The session clock.
 * @param stats - Where per-frame measurements go.
 * @returns The running engine.
 */
function startEngine(
  host: HTMLElement,
  catalog: BodyCatalog,
  clock: Clock,
  stats: StatsSink,
): Engine {
  const engine = createEngine({
    clock,
    scheduler: createAnimationFrameScheduler(),
    scene: createSpaceScene({
      canvas: createSceneCanvas(host),
      catalog,
      buildVisuals: createSolarSystemVisuals,
      wallClockSeconds: () => clock.nowSeconds(),
      place: placeVisual,
    }),
    stats,
  });
  engine.setTimeScale(multiplierFor(INITIAL_TIME_SCALE));
  engine.start();
  return engine;
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
  const catalog = buildCatalog(rawCatalog as unknown as RawCatalog);

  const clock = createPerformanceClock();
  const nowMs = (): number => clock.nowSeconds() * 1000;
  const { bootScreen, stats, timeHud } = mountUi(
    host,
    { selection, capabilities, seedPhrase: session.phrase },
    nowMs,
  );

  const engine = options.startRenderLoop
    ? startEngine(host, catalog, clock, combineStatsSinks([stats, timeHud]))
    : undefined;

  return ok({
    tier: selection.tier,
    seedPhrase: session.phrase,
    bodyCount: catalog.all.length,
    stats,
    engine,
    dismissTitleScreen(): void {
      bootScreen.dismiss();
    },
    setTimeScale(state: TimeScaleState): void {
      engine?.setTimeScale(multiplierFor(state));
      timeHud.setTimeScale(state);
    },
    dispose(): void {
      engine?.stop();
      timeHud.dispose();
      stats.dispose();
      host.replaceChildren();
    },
  });
}
