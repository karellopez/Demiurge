/**
 * The wires the composition root ties.
 *
 * Split out of `composition-root.ts` so that file stays what its name promises:
 * a readable list of what is connected to what. Everything here is a small,
 * single-purpose builder that takes its dependencies as arguments — there is no
 * service locator, no global singleton and no module-level mutable state.
 *
 * @module
 */

import type { BodyCatalog } from '@domain/body';
import { INITIAL_TIME_SCALE, multiplierFor } from '@domain/time-scale';
import { createCameraRig } from '@features/camera/camera-rig';
import type { DiagnosticsSink } from '@features/diagnostics/ports';
import { createEngine, type Engine } from '@features/engine/engine';
import type { Clock, FrameStats, StatsSink } from '@features/engine/ports';
import { createAnimationFrameScheduler } from '@presentation/render/browser-frame-loop';
import { createSolarSystemVisuals, placeVisual } from '@presentation/render/solar-system-scene';
import { createSpaceScene, type SpaceScene } from '@presentation/render/space-scene';
import type { BodyBrowser } from '@presentation/ui/body-browser';
import {
  combineDiagnosticsSinks,
  createConsoleDiagnosticsSink,
  mountBootScreen,
} from '@presentation/ui/boot-screen';
import { mountStatsOverlay, type StatsOverlay } from '@presentation/ui/stats-overlay';
import { mountTimeHud, type TimeHud } from '@presentation/ui/time-hud';
import { createVec3 } from '@shared/math/vec3';

/** Which body a session opens on. Close enough to see, familiar enough to orient. */
export const INITIAL_BODY_ID = 'earth';

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
export interface MountedUi {
  /** The title screen, until the first key clears it. */
  readonly bootScreen: ReturnType<typeof mountBootScreen>;
  /** The `F3` overlay. */
  readonly stats: StatsOverlay;
  /** The bottom bar carrying the clock and the seed. */
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
export function mountUi(
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
 * Builds the scene, wiring the camera rig over the propagated positions.
 *
 * @param host - The element the scene canvas is appended to.
 * @param catalog - The bodies to simulate.
 * @param clock - The session clock.
 * @returns The scene.
 */
export function buildScene(host: HTMLElement, catalog: BodyCatalog, clock: Clock): SpaceScene {
  return createSpaceScene({
    canvas: createSceneCanvas(host),
    catalog,
    buildVisuals: createSolarSystemVisuals,
    place: placeVisual,
    wallClockSeconds: () => clock.nowSeconds(),
    buildRig: (positions) =>
      createCameraRig({ catalog, positions, initialBodyId: INITIAL_BODY_ID }),
  });
}

/**
 * Keeps the stats card and the list selection in step with the rig.
 *
 * Hung off the frame stats rather than polled, because the engine already
 * publishes once per frame and a second timer would only drift against it.
 *
 * @param browser - The browser to refresh.
 * @param scene - The scene holding the rig and the positions.
 * @param catalog - Used to find the star.
 * @returns A sink that refreshes the card each frame.
 */
export function createCardRefresher(
  browser: BodyBrowser,
  scene: SpaceScene,
  catalog: BodyCatalog,
): StatsSink {
  // PERF: mutable for zero-alloc — the card runs on the frame path.
  const bodyPosition = createVec3();
  const starPosition = createVec3();
  const cameraPosition = createVec3();
  let lastBodyId = '';

  return {
    publish(): void {
      const state = scene.rig.state();
      if (state.body.id !== lastBodyId) {
        lastBodyId = state.body.id;
        browser.markSelected(state.body.id);
      }

      scene.positions.readPosition(state.body.id, bodyPosition);
      scene.positions.readPosition(catalog.root.id, starPosition);
      scene.readCameraPosition(cameraPosition);

      browser.refresh({
        body: state.body,
        mode: state.mode,
        bodyPosition,
        starPosition,
        cameraPosition,
      });
    },
  };
}

/**
 * Starts the frame loop over a scene.
 *
 * @param scene - The scene to drive.
 * @param clock - The session clock.
 * @param sinks - Where each frame's statistics go.
 * @returns The running engine.
 */
export function startEngine(scene: SpaceScene, clock: Clock, sinks: readonly StatsSink[]): Engine {
  const engine = createEngine({
    clock,
    scheduler: createAnimationFrameScheduler(),
    scene,
    stats: combineStatsSinks(sinks),
  });
  engine.setTimeScale(multiplierFor(INITIAL_TIME_SCALE));
  engine.start();
  return engine;
}
