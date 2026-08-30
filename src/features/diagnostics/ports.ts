/**
 * Ports the diagnostics feature declares and the presentation layer implements.
 *
 * These interfaces are the feature's whole contract with the outside world.
 * Nothing here mentions WebGL, the DOM or `navigator`; the adapters that do live
 * in `presentation/` and are wired in by the composition root. That is what lets
 * the tier-selection rules be unit-tested in Node against a table of fake
 * machines rather than against whatever GPU happens to be running CI.
 *
 * @module
 */

import type { QualityTier } from '@domain/quality-tier';

/** What the host machine reports about itself, normalised. */
export interface HostCapabilities {
  /**
   * The unmasked WebGL renderer string, such as
   * `ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)`.
   * Empty when the browser withholds it, which is common and must not be fatal.
   */
  readonly rendererDescription: string;

  /** Reported device memory in gibibytes, or `undefined` where unavailable. */
  readonly deviceMemoryGiB: number | undefined;

  /** Logical CPU count, clamped by the browser. At least 1. */
  readonly hardwareConcurrency: number;

  /** Whether a WebGL2 context could be created at all. */
  readonly supportsWebGL2: boolean;

  /**
   * Result of a short GPU micro-benchmark, in fill-rate units, or `undefined`
   * when it was skipped. Higher is faster.
   */
  readonly microBenchmarkScore: number | undefined;
}

/** A resolved tier, together with the reason it was chosen. */
export interface TierSelection {
  /** The tier the machine will run at until the player overrides it. */
  readonly tier: QualityTier;

  /**
   * A plain-language explanation, shown in settings and logged at boot.
   * The player is always allowed to disagree with it.
   */
  readonly reason: string;
}

/** Everything settled at boot, in one record. */
export interface BootReport {
  /** The tier this session will start at. */
  readonly selection: TierSelection;
  /** The raw capabilities that choice was made from. */
  readonly capabilities: HostCapabilities;
  /** The canonical seed phrase this universe is generated from. */
  readonly seedPhrase: string;
}

/** Where a boot-time diagnostic report is delivered. */
export interface DiagnosticsSink {
  /**
   * Publishes what was settled at boot.
   *
   * @param report - The tier, the evidence for it, and the session seed.
   */
  report(report: BootReport): void;
}
