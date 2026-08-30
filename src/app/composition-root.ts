/**
 * The composition root: the one place concrete classes meet.
 *
 * Every dependency in the project is passed in through a constructor or a
 * factory argument, and every one of those wires is tied here. There is no
 * service locator, no global singleton and no module-level mutable state, so
 * reading this file tells you the entire shape of the running program. The
 * builders it calls live in {@link ./wiring}.
 *
 * @module
 */

import type { ScaleSettings } from '@domain/scale';
import { resolveSessionSeed } from '@domain/session-seed';
import { multiplierFor, type TimeScaleState } from '@domain/time-scale';
import { detectQualityTier } from '@features/diagnostics/detect-quality-tier';
import type { Engine } from '@features/engine/engine';
import { buildCatalog } from '@features/space/body-catalog';
import type { RawCatalog } from '@features/space/catalog-schema';
import { createPerformanceClock } from '@presentation/render/browser-frame-loop';
import type { SpaceScene } from '@presentation/render/space-scene';
import { probeHostCapabilities } from '@presentation/render/webgl-host-capabilities';
import { mountBodyBrowser, type BodyBrowser } from '@presentation/ui/body-browser';
import type { mountBootScreen } from '@presentation/ui/boot-screen';
import type { StatsOverlay } from '@presentation/ui/stats-overlay';
import type { TimeHud } from '@presentation/ui/time-hud';
import { err, ok, type Result } from '@shared/result';

import rawCatalog from '../../data/bodies.json';

import type { BootFailure } from './boot-failure';
import { INITIAL_BODY_ID, buildScene, createCardRefresher, mountUi, startEngine } from './wiring';

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

/** A started application, and the handles it exposes to the input layer. */
export interface RunningApplication {
  /** The tier the session started at. */
  readonly tier: string;
  /** The canonical seed this universe was generated from. */
  readonly seedPhrase: string;
  /** How many bodies the catalogue loaded. */
  readonly bodyCount: number;
  /** The statistics overlay, so `F3` can toggle it. */
  readonly stats: StatsOverlay;
  /** The body browser, so `B` can toggle it. */
  readonly browser: BodyBrowser;
  /** The scene, or `undefined` when the render loop was not started. */
  readonly scene: SpaceScene | undefined;
  /** The engine, or `undefined` when the render loop was not started. */
  readonly engine: Engine | undefined;
  /** Clears the title screen. */
  dismissTitleScreen(): void;
  /**
   * Applies a new time-warp setting to both the engine and the readout.
   *
   * @param state - The new position on the ladder.
   */
  setTimeScale(state: TimeScaleState): void;
  /**
   * Starts a scale transition.
   *
   * @param settings - The exaggeration to move to.
   */
  setScale(settings: ScaleSettings): void;
  /** Releases everything the application holds. */
  dispose(): void;
}

/** Everything `startApplication` settles before it can hand back a handle. */
interface ApplicationParts {
  readonly host: HTMLElement;
  readonly tier: string;
  readonly seedPhrase: string;
  readonly bodyCount: number;
  readonly bootScreen: ReturnType<typeof mountBootScreen>;
  readonly stats: StatsOverlay;
  readonly timeHud: TimeHud;
  readonly browser: BodyBrowser;
  readonly scene: SpaceScene | undefined;
  readonly engine: Engine | undefined;
}

/**
 * Gathers the wired pieces into the handle the input layer drives.
 *
 * @param parts - Everything already built.
 * @returns The running application.
 */
function assembleApplication(parts: ApplicationParts): RunningApplication {
  const { host, bootScreen, stats, timeHud, browser, scene, engine } = parts;
  return {
    tier: parts.tier,
    seedPhrase: parts.seedPhrase,
    bodyCount: parts.bodyCount,
    stats,
    browser,
    scene,
    engine,
    dismissTitleScreen(): void {
      bootScreen.dismiss();
    },
    setTimeScale(state: TimeScaleState): void {
      engine?.setTimeScale(multiplierFor(state));
      timeHud.setTimeScale(state);
    },
    setScale(settings: ScaleSettings): void {
      scene?.setScale(settings);
    },
    dispose(): void {
      engine?.stop();
      browser.dispose();
      timeHud.dispose();
      stats.dispose();
      host.replaceChildren();
    },
  };
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

  const scene = options.startRenderLoop ? buildScene(host, catalog, clock) : undefined;
  const browser = mountBodyBrowser(
    host,
    catalog,
    (bodyId) => {
      scene?.rig.select(bodyId);
    },
    nowMs,
  );
  browser.markSelected(INITIAL_BODY_ID);

  const engine =
    scene === undefined
      ? undefined
      : startEngine(scene, clock, [stats, timeHud, createCardRefresher(browser, scene, catalog)]);

  return ok(
    assembleApplication({
      host,
      tier: selection.tier,
      seedPhrase: session.phrase,
      bodyCount: catalog.all.length,
      bootScreen,
      stats,
      timeHud,
      browser,
      scene,
      engine,
    }),
  );
}
