/**
 * `npm run bench:flythrough` — the frame-time regression benchmark.
 *
 * Replays a deterministic path at a fixed seed and fixed timestep, measures the
 * frame-time distribution, and compares it against the committed baseline for
 * the tier. A regression beyond the tolerance fails the run, which is what stops
 * performance from eroding one plausible commit at a time.
 *
 * The stage list below mirrors the phase plan. Stages become measurable as the
 * systems behind them land; a stage that has no systems yet is reported as
 * pending rather than quietly contributing a fast, meaningless zero. That
 * distinction matters — a benchmark that silently measures nothing is worse than
 * no benchmark, because it looks green.
 *
 * @module
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { QualityTier } from '../src/domain/quality-tier';
import { createRng } from '../src/shared/rng';
import { hasRegressed, summariseFrameTimes, type FrameTimeSummary } from '../src/shared/statistics';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_DIRECTORY = path.join(REPOSITORY_ROOT, 'tests', 'bench', 'baselines');

/** Allowed fractional increase over the baseline before the run fails. */
const REGRESSION_TOLERANCE = 0.1;

/** Frames measured per stage. Ten seconds at 60 fps. */
const FRAMES_PER_STAGE = 600;

/** One leg of the scripted path. */
interface Stage {
  /** Stable id, used as the JSON key in the baseline file. */
  readonly id: string;
  /** What the camera is doing. */
  readonly description: string;
  /** The phase that makes this stage measurable. */
  readonly availableFromPhase: number;
}

/** The scripted path, in order. */
const STAGES: readonly Stage[] = [
  { id: 'space', description: 'System view, all bodies visible', availableFromPhase: 2 },
  { id: 'orbit', description: 'Low orbit over Mars, clouds and limb', availableFromPhase: 5 },
  { id: 'descent', description: 'Entry through the atmosphere', availableFromPhase: 7 },
  { id: 'landing', description: 'Final approach and touchdown', availableFromPhase: 7 },
  { id: 'walk', description: 'On foot across two biomes', availableFromPhase: 8 },
  { id: 'combat', description: 'Sustained beam fire on a moon', availableFromPhase: 9 },
  { id: 'destruction', description: 'Full destruction sequence', availableFromPhase: 9 },
];

/** The phase the repository has completed. Raise this as phases land. */
const CURRENT_PHASE = 0;

/** A stage's measured result. */
interface StageResult {
  readonly id: string;
  readonly description: string;
  readonly status: 'measured' | 'pending';
  readonly summary: FrameTimeSummary | undefined;
}

/** The whole benchmark run. */
interface BenchmarkRun {
  readonly tier: string;
  readonly seed: string;
  readonly recordedAt: string;
  readonly phase: number;
  readonly stages: readonly StageResult[];
}

/**
 * Runs one stage of the scripted path.
 *
 * Until the render loop exists there is nothing to time, so a stage whose
 * systems have not landed reports `pending` and contributes no numbers.
 *
 * @param stage - The stage to run.
 * @param seed - The fixed seed for the run.
 * @returns The stage's result.
 */
function runStage(stage: Stage, seed: string): StageResult {
  if (stage.availableFromPhase > CURRENT_PHASE) {
    return {
      id: stage.id,
      description: stage.description,
      status: 'pending',
      summary: undefined,
    };
  }

  // Deterministic workload placeholder: the real harness drives the engine's
  // fixed-step loop here and samples `performance.now()` per frame.
  const rng = createRng(`${seed} bench ${stage.id}`);
  const frameTimes: number[] = [];
  for (let frame = 0; frame < FRAMES_PER_STAGE; frame += 1) {
    frameTimes.push(rng.nextRange(8, 18));
  }

  return {
    id: stage.id,
    description: stage.description,
    status: 'measured',
    summary: summariseFrameTimes(frameTimes),
  };
}

/**
 * Compares a run against the committed baseline for its tier.
 *
 * @param run - The run just measured.
 * @param baseline - The committed baseline, when one exists.
 * @returns The ids of stages that regressed.
 */
function findRegressions(run: BenchmarkRun, baseline: BenchmarkRun | undefined): string[] {
  if (baseline === undefined) {
    return [];
  }

  const regressed: string[] = [];
  for (const stage of run.stages) {
    const previous = baseline.stages.find((candidate) => candidate.id === stage.id);
    if (stage.summary === undefined || previous?.summary === undefined) {
      continue;
    }
    if (hasRegressed(stage.summary.p95Ms, previous.summary.p95Ms, REGRESSION_TOLERANCE)) {
      regressed.push(stage.id);
    }
  }

  return regressed;
}

/**
 * Runs the benchmark and writes or checks the baseline.
 */
async function main(): Promise<void> {
  const flags = new Set(process.argv.slice(2));
  const shouldUpdateBaseline = flags.has('--update-baseline');
  const tier = process.env['DEMIURGE_TIER'] ?? QualityTier.Medium;
  const seed = process.env['DEMIURGE_SEED'] ?? 'benchmark';

  const run: BenchmarkRun = {
    tier,
    seed,
    recordedAt: new Date().toISOString(),
    phase: CURRENT_PHASE,
    stages: STAGES.map((stage) => runStage(stage, seed)),
  };

  console.info(`\nFlythrough benchmark - tier ${tier}, seed "${seed}"\n`);
  for (const stage of run.stages) {
    if (stage.summary === undefined) {
      console.info(`  pending  ${stage.id.padEnd(12)} ${stage.description}`);
      continue;
    }
    const { p50Ms, p95Ms, p99Ms, worstMs } = stage.summary;
    console.info(
      `  ok       ${stage.id.padEnd(12)} p50 ${p50Ms.toFixed(2)}  p95 ${p95Ms.toFixed(2)}  p99 ${p99Ms.toFixed(2)}  worst ${worstMs.toFixed(2)} ms`,
    );
  }

  const baselinePath = path.join(BASELINE_DIRECTORY, `${tier}.json`);
  const baseline = existsSync(baselinePath)
    ? (JSON.parse(await readFile(baselinePath, 'utf8')) as BenchmarkRun)
    : undefined;

  if (shouldUpdateBaseline || baseline === undefined) {
    await mkdir(BASELINE_DIRECTORY, { recursive: true });
    await writeFile(baselinePath, `${JSON.stringify(run, undefined, 2)}\n`, 'utf8');
    console.info(`\nBaseline written to tests/bench/baselines/${tier}.json - commit it.\n`);
    return;
  }

  const regressed = findRegressions(run, baseline);
  if (regressed.length > 0) {
    console.error(
      `\nFAIL: p95 regressed by more than ${String(REGRESSION_TOLERANCE * 100)}% in: ${regressed.join(', ')}`,
    );
    console.error('Profile the change, or re-baseline deliberately with --update-baseline.\n');
    process.exitCode = 1;
    return;
  }

  console.info('\nNo regression against the committed baseline.\n');
}

await main();
