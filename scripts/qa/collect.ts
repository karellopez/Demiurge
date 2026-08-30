/**
 * The collectors: one function per quality gate.
 *
 * Each returns a {@link Gate} rather than throwing, so `npm run qa` always
 * prints the complete table even when several gates are red. Anything a
 * collector cannot measure becomes a *skipped* gate with a stated reason, never
 * a silent pass.
 *
 * @module
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { booleanGate, type Gate, numericGate, skippedGate, summarise } from './gates';
import { parseJsonOutput, run, runTool } from './shell';
import type { FileMetrics } from './source-metrics';

/** The ratchetable thresholds, as loaded from `thresholds.json`. */
export type Thresholds = Record<string, number>;

/** Coverage totals for one slice of the codebase. */
interface CoverageTotals {
  readonly linesPercent: number;
  readonly branchesPercent: number;
}

/** Shape of the entries in Vitest's `coverage-summary.json`. */
interface CoverageSummaryEntry {
  readonly lines?: { total: number; covered: number };
  readonly branches?: { total: number; covered: number };
}

/**
 * Runs the TypeScript compiler over both projects.
 *
 * @param cwd - The repository root.
 * @returns The type-safety gate.
 */
export function collectTypecheck(cwd: string): Gate {
  const app = runTool('tsc', ['--noEmit', '-p', 'tsconfig.app.json'], { cwd });
  const node = runTool('tsc', ['--noEmit', '-p', 'tsconfig.node.json'], { cwd });
  const isPassed = app.succeeded && node.succeeded;

  return booleanGate('typecheck', 'Type safety', 'tsc --noEmit (strict)', {
    passed: isPassed,
    threshold: 'zero errors',
    detail: isPassed ? undefined : summarise(`${app.stdout}\n${node.stdout}`),
  });
}

/**
 * Runs ESLint across the repository with warnings treated as failures.
 *
 * @param cwd - The repository root.
 * @returns The lint gate.
 */
export function collectLint(cwd: string): Gate {
  const result = runTool('eslint', ['.', '--max-warnings=0'], { cwd });
  return booleanGate('lint', 'Lint', 'eslint', {
    passed: result.succeeded,
    threshold: 'zero errors, zero warnings',
    detail: result.succeeded ? undefined : summarise(result.stdout || result.stderr, 12),
  });
}

/** A running total of covered and total counts. */
interface CoverageTally {
  covered: number;
  total: number;
}

/**
 * Turns a tally into a percentage, treating "nothing to cover" as fully covered.
 *
 * @param tally - The running total.
 * @returns The percentage, 0-100.
 */
function asPercent(tally: CoverageTally): number {
  return tally.total === 0 ? 100 : (tally.covered / tally.total) * 100;
}

/**
 * Adds one file's counts to a tally.
 *
 * @param tally - The running total so far.
 * @param counts - The file's counts, absent when the reporter omitted them.
 * @returns A new tally including this file.
 */
function plus(
  tally: CoverageTally,
  counts: { total: number; covered: number } | undefined,
): CoverageTally {
  return {
    total: tally.total + (counts?.total ?? 0),
    covered: tally.covered + (counts?.covered ?? 0),
  };
}

/**
 * Reports whether a file belongs to the pure core layers.
 *
 * @param filePath - A path from the coverage summary, separators already normalised.
 * @returns True for files under `src/shared/` or `src/domain/`.
 */
function isCoreLayer(filePath: string): boolean {
  return filePath.includes('/src/shared/') || filePath.includes('/src/domain/');
}

/**
 * Sums coverage over the files a predicate selects.
 *
 * @param summary - The parsed `coverage-summary.json`.
 * @param shouldInclude - Chooses which files to count.
 * @returns Line and branch percentages over just those files.
 */
function totalCoverage(
  summary: Record<string, CoverageSummaryEntry>,
  shouldInclude: (filePath: string) => boolean,
): CoverageTotals {
  let lines: CoverageTally = { covered: 0, total: 0 };
  let branches: CoverageTally = { covered: 0, total: 0 };

  for (const [filePath, entry] of Object.entries(summary)) {
    // Vitest keys these with the host's separators, so a Windows run reports
    // `.\src\shared\rng.ts` where CI reports `./src/shared/rng.ts`.
    const normalised = filePath.replaceAll('\\', '/');
    if (filePath !== 'total' && shouldInclude(normalised)) {
      lines = plus(lines, entry.lines);
      branches = plus(branches, entry.branches);
    }
  }

  return { linesPercent: asPercent(lines), branchesPercent: asPercent(branches) };
}

/**
 * Reads the coverage summary written by the last `npm run test:coverage`.
 *
 * @param cwd - The repository root.
 * @param thresholds - The ratchetable thresholds.
 * @returns Four gates: overall lines and branches, then the same for the pure core.
 */
export function collectCoverage(cwd: string, thresholds: Thresholds): Gate[] {
  const summaryPath = path.join(cwd, 'coverage', 'coverage-summary.json');
  if (!existsSync(summaryPath)) {
    const reason = 'coverage/coverage-summary.json is missing; run `npm run test:coverage` first.';
    return [
      skippedGate('coverage-lines', 'Coverage - lines, overall', 'vitest v8', reason),
      skippedGate('coverage-branches', 'Coverage - branches, overall', 'vitest v8', reason),
      skippedGate('coverage-lines-core', 'Coverage - lines, shared+domain', 'vitest v8', reason),
      skippedGate(
        'coverage-branches-core',
        'Coverage - branches, shared+domain',
        'vitest v8',
        reason,
      ),
    ];
  }

  const summary = JSON.parse(readFileSync(summaryPath, 'utf8')) as Record<
    string,
    CoverageSummaryEntry
  >;
  const overall = totalCoverage(summary, () => true);
  const core = totalCoverage(summary, isCoreLayer);

  return [
    numericGate({
      id: 'coverage-lines',
      name: 'Coverage - lines, overall',
      tool: 'vitest v8',
      measured: overall.linesPercent,
      threshold: thresholds['coverageLinesOverall'] ?? 80,
      direction: 'min',
      unit: '%',
    }),
    numericGate({
      id: 'coverage-branches',
      name: 'Coverage - branches, overall',
      tool: 'vitest v8',
      measured: overall.branchesPercent,
      threshold: thresholds['coverageBranchesOverall'] ?? 75,
      direction: 'min',
      unit: '%',
    }),
    numericGate({
      id: 'coverage-lines-core',
      name: 'Coverage - lines, shared+domain',
      tool: 'vitest v8',
      measured: core.linesPercent,
      threshold: thresholds['coverageLinesCore'] ?? 95,
      direction: 'min',
      unit: '%',
    }),
    numericGate({
      id: 'coverage-branches-core',
      name: 'Coverage - branches, shared+domain',
      tool: 'vitest v8',
      measured: core.branchesPercent,
      threshold: thresholds['coverageBranchesCore'] ?? 90,
      direction: 'min',
      unit: '%',
    }),
  ];
}

/**
 * Cruises the dependency graph for cycles and architecture violations.
 *
 * @param cwd - The repository root.
 * @returns Two gates: circular dependencies, and layering violations.
 */
export function collectArchitecture(cwd: string): Gate[] {
  const result = runTool(
    'depcruise',
    ['src', 'scripts', '--config', '.dependency-cruiser.cjs', '--output-type', 'json'],
    { cwd },
  );
  const parsed = parseJsonOutput(result.stdout) as
    | { summary?: { violations?: { rule?: { name?: string }; from?: string; to?: string }[] } }
    | undefined;

  if (parsed?.summary?.violations === undefined) {
    const reason = `dependency-cruiser produced no parseable report. ${summarise(result.stderr, 3)}`;
    return [
      skippedGate('cycles', 'Circular dependencies', 'dependency-cruiser', reason),
      skippedGate('architecture', 'Architecture violations', 'dependency-cruiser', reason),
    ];
  }

  const violations = parsed.summary.violations;
  const cycles = violations.filter((violation) => violation.rule?.name === 'no-circular');
  const others = violations.filter((violation) => violation.rule?.name !== 'no-circular');
  const describe = (list: typeof violations): string =>
    list.map((v) => `${v.rule?.name ?? '?'}: ${v.from ?? '?'} -> ${v.to ?? '?'}`).join('\n');

  return [
    booleanGate('cycles', 'Circular dependencies', 'dependency-cruiser', {
      passed: cycles.length === 0,
      threshold: '0',
      detail: cycles.length === 0 ? undefined : describe(cycles),
    }),
    booleanGate('architecture', 'Architecture violations', 'dependency-cruiser', {
      passed: others.length === 0,
      threshold: '0',
      detail: others.length === 0 ? undefined : describe(others),
    }),
  ];
}

/**
 * Validates the body catalogue against its schema and its invariants.
 *
 * A mistyped radius would not crash anything; it would quietly produce a planet
 * the wrong size, which is worse. So the catalogue is a gate.
 *
 * @param cwd - The repository root.
 * @returns The catalogue-validity gate.
 */
export function collectDataSchema(cwd: string): Gate {
  const result = run('npm', ['run', '--silent', 'validate:data'], { cwd });
  return booleanGate('data-schema', 'Body catalogue schema + invariants', 'ajv', {
    passed: result.succeeded,
    threshold: 'valid',
    detail: result.succeeded ? undefined : summarise(result.stdout || result.stderr, 12),
  });
}

/**
 * Looks for dead code, unused exports and unused dependencies.
 *
 * @param cwd - The repository root.
 * @returns The dead-code gate.
 */
export function collectDeadCode(cwd: string): Gate {
  const result = runTool('knip', ['--no-progress'], { cwd });
  return booleanGate('dead-code', 'Dead code / unused exports / unused deps', 'knip', {
    passed: result.succeeded,
    threshold: '0',
    detail: result.succeeded ? undefined : summarise(result.stdout || result.stderr, 12),
  });
}

/**
 * Measures copy-paste duplication.
 *
 * @param cwd - The repository root.
 * @param thresholds - The ratchetable thresholds.
 * @returns The duplication gate.
 */
export function collectDuplication(cwd: string, thresholds: Thresholds): Gate {
  const result = runTool('jscpd', ['--silent'], { cwd });
  const reportPath = path.join(cwd, 'reports', 'jscpd', 'jscpd-report.json');

  if (!existsSync(reportPath)) {
    return skippedGate(
      'duplication',
      'Code duplication',
      'jscpd',
      `jscpd wrote no report. ${summarise(result.stderr, 3)}`,
    );
  }

  const report = JSON.parse(readFileSync(reportPath, 'utf8')) as {
    statistics?: { total?: { percentage?: number } };
  };
  const percentage = report.statistics?.total?.percentage ?? 0;

  return numericGate({
    id: 'duplication',
    name: 'Code duplication',
    tool: 'jscpd',
    measured: percentage,
    threshold: thresholds['duplicationPercentMax'] ?? 3,
    direction: 'max',
    unit: '%',
  });
}

/**
 * Checks the built bundle against its size budget.
 *
 * @param cwd - The repository root.
 * @returns The bundle-size gate.
 */
export function collectBundleSize(cwd: string): Gate {
  if (!existsSync(path.join(cwd, 'dist'))) {
    return skippedGate(
      'bundle-size',
      'Bundle size',
      'size-limit',
      'dist/ is missing; run `npm run build` first.',
    );
  }

  const result = runTool('size-limit', ['--json'], { cwd });
  const parsed = parseJsonOutput(result.stdout) as
    { name?: string; size?: number; sizeLimit?: number; passed?: boolean }[] | undefined;

  if (parsed === undefined) {
    return skippedGate(
      'bundle-size',
      'Bundle size',
      'size-limit',
      `size-limit produced no parseable report. ${summarise(result.stderr, 3)}`,
    );
  }

  const describe = (entry: (typeof parsed)[number]): string =>
    `${entry.name ?? '?'}: ${((entry.size ?? 0) / 1024).toFixed(1)} kB of ${(
      (entry.sizeLimit ?? 0) / 1024
    ).toFixed(0)} kB`;

  return booleanGate('bundle-size', 'Bundle size', 'size-limit', {
    passed: result.succeeded,
    threshold: 'within .size-limit.json',
    detail: parsed.map((entry) => describe(entry)).join('\n'),
  });
}

/**
 * Audits production dependencies for known vulnerabilities.
 *
 * @param cwd - The repository root.
 * @returns The vulnerability gate.
 */
export function collectVulnerabilities(cwd: string): Gate {
  const result = run('npm', ['audit', '--omit=dev', '--json'], { cwd });
  const parsed = parseJsonOutput(result.stdout) as
    { metadata?: { vulnerabilities?: Record<string, number> } } | undefined;

  const counts = parsed?.metadata?.vulnerabilities;
  if (counts === undefined) {
    return skippedGate(
      'vulnerabilities',
      'Known vulnerabilities',
      'npm audit',
      `npm audit produced no parseable report. ${summarise(result.stderr, 3)}`,
    );
  }

  const serious = (counts['high'] ?? 0) + (counts['critical'] ?? 0);
  return numericGate({
    id: 'vulnerabilities',
    name: 'Known vulnerabilities (high + critical)',
    tool: 'npm audit --omit=dev',
    measured: serious,
    threshold: 0,
    direction: 'max',
    decimals: 0,
    detail: serious === 0 ? undefined : JSON.stringify(counts),
  });
}

/**
 * Checks every production dependency against the licence allowlist.
 *
 * @param cwd - The repository root.
 * @returns The licence-compliance gate.
 */
export function collectLicenses(cwd: string): Gate {
  const result = run('npm', ['run', '--silent', 'audit:licenses'], { cwd });
  return booleanGate('licenses', 'License compliance', 'license-checker', {
    passed: result.succeeded,
    threshold: 'allowlist only',
    detail: result.succeeded ? undefined : summarise(result.stdout || result.stderr, 8),
  });
}

/** The part of Stryker's JSON report the score is computed from. */
interface StrykerReport {
  readonly files?: Record<string, { mutants?: { status?: string }[] }>;
}

/** Statuses that mean the mutant was never really tested, so it does not count. */
const UNCOUNTED_MUTANT_STATUSES = new Set(['Ignored', 'CompileError', 'NoCoverage']);

/** Statuses that mean the test suite caught the mutant. */
const CAUGHT_MUTANT_STATUSES = new Set(['Killed', 'Timeout']);

/**
 * Counts caught and countable mutants across a Stryker report.
 *
 * @param report - The parsed report.
 * @returns How many mutants were caught, and how many counted at all.
 */
function tallyMutants(report: StrykerReport): { killed: number; total: number } {
  const files = Object.values(report.files ?? {});
  const mutants = files.flatMap((file) => file.mutants ?? []);
  const counted = mutants.filter((mutant) => !UNCOUNTED_MUTANT_STATUSES.has(mutant.status ?? ''));
  const caught = counted.filter((mutant) => CAUGHT_MUTANT_STATUSES.has(mutant.status ?? ''));
  return { killed: caught.length, total: counted.length };
}

/**
 * Reads the mutation score from the last Stryker run, if there was one.
 *
 * Mutation testing is far too slow for the every-commit `verify` loop, so it
 * runs on its own CI schedule and this collector reports whatever it last left
 * behind.
 *
 * @param cwd - The repository root.
 * @param thresholds - The ratchetable thresholds.
 * @returns The mutation-score gate.
 */
export function collectMutationScore(cwd: string, thresholds: Thresholds): Gate {
  const reportPath = path.join(cwd, 'reports', 'mutation', 'mutation.json');
  if (!existsSync(reportPath)) {
    return skippedGate(
      'mutation',
      'Mutation score - shared + domain',
      'stryker',
      'No mutation report on disk; run `npm run mutation` (CI runs it on a schedule).',
    );
  }

  const report = JSON.parse(readFileSync(reportPath, 'utf8')) as StrykerReport;
  const { killed, total } = tallyMutants(report);

  return numericGate({
    id: 'mutation',
    name: 'Mutation score - shared + domain',
    tool: 'stryker',
    measured: total === 0 ? 100 : (killed / total) * 100,
    threshold: thresholds['mutationScore'] ?? 65,
    direction: 'min',
    unit: '%',
  });
}

/**
 * Turns the per-file source metrics into their three gates.
 *
 * @param metrics - Metrics for every file under `src/`.
 * @param thresholds - The ratchetable thresholds.
 * @returns Maintainability, TSDoc coverage, and the size-limit gates.
 */
export function collectSourceGates(
  metrics: readonly FileMetrics[],
  thresholds: Thresholds,
): Gate[] {
  // `measureSources` hands these over already sorted worst-first.
  const worstMaintainability = metrics[0] ?? { path: 'none', maintainabilityIndex: 100 };

  let documentable = 0;
  let documented = 0;
  for (const file of metrics) {
    documentable += file.documentableExports;
    documented += file.documentedExports;
  }
  const undocumented = metrics.filter((file) => file.documentedExports < file.documentableExports);

  const maxFileLines = thresholds['maxFileLines'] ?? 400;
  const maxClassLines = thresholds['maxClassLines'] ?? 200;
  const oversized = metrics.filter(
    (file) => file.physicalLines > maxFileLines || file.longestClassLines > maxClassLines,
  );

  return [
    numericGate({
      id: 'maintainability',
      name: 'Maintainability index (worst file)',
      tool: 'scripts/qa (TypeScript AST)',
      measured: worstMaintainability.maintainabilityIndex,
      threshold: thresholds['maintainabilityIndexMin'] ?? 70,
      direction: 'min',
      detail: `worst: ${worstMaintainability.path}`,
    }),
    numericGate({
      id: 'tsdoc',
      name: 'TSDoc coverage on exported API',
      tool: 'scripts/qa (TypeScript AST)',
      measured: documentable === 0 ? 100 : (documented / documentable) * 100,
      threshold: thresholds['tsdocCoveragePercentMin'] ?? 90,
      direction: 'min',
      unit: '%',
      detail:
        undocumented.length === 0
          ? undefined
          : undocumented
              .map(
                (file) =>
                  `${file.path}: ${String(file.documentedExports)}/${String(file.documentableExports)} documented`,
              )
              .join('\n'),
    }),
    booleanGate('file-size', 'File and class size limits', 'scripts/qa (TypeScript AST)', {
      passed: oversized.length === 0,
      threshold: `<= ${String(maxFileLines)} lines/file, <= ${String(maxClassLines)} lines/class`,
      detail:
        oversized.length === 0
          ? undefined
          : oversized
              .map(
                (file) =>
                  `${file.path}: ${String(file.physicalLines)} lines, longest class ${String(file.longestClassLines)}`,
              )
              .join('\n'),
    }),
  ];
}
