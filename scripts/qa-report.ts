/**
 * `npm run qa` — measures every quality gate, writes the report, sets the exit code.
 *
 * The whole point is that quality is a *number* in this project rather than an
 * opinion. This script runs each gate, prints one table, writes
 * `docs/quality/report.md` and `report.json`, and exits non-zero if anything is
 * red. CI publishes the same two files as a build artefact and as a PR comment.
 *
 * Flags:
 *   `--ratchet`  after a green run, tighten any threshold the code has outgrown
 *                and rewrite `scripts/qa/thresholds.json` (brief 5.2).
 *   `--quick`    skip the slow collectors (typecheck, lint) for a fast local read.
 *
 * @module
 */

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  collectArchitecture,
  collectBundleSize,
  collectCoverage,
  collectDeadCode,
  collectDuplication,
  collectLicenses,
  collectLint,
  collectMutationScore,
  collectSourceGates,
  collectTypecheck,
  collectVulnerabilities,
  type Thresholds,
} from './qa/collect';
import type { Gate, GateStatus } from './qa/gates';
import { measureFile, type FileMetrics } from './qa/source-metrics';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const THRESHOLDS_PATH = path.join(REPOSITORY_ROOT, 'scripts', 'qa', 'thresholds.json');
const REPORT_DIRECTORY = path.join(REPOSITORY_ROOT, 'docs', 'quality');

/** How much a metric must beat its threshold by before the ratchet tightens it. */
const RATCHET_MARGIN = 2;

/**
 * The gates the ratchet is allowed to tighten, and the threshold key each writes.
 *
 * The two whole-project coverage numbers are deliberately absent. They move with
 * the *ratio* of pure logic to adapter code rather than with quality: landing a
 * WebGL renderer, which is exercised by Playwright rather than by Vitest,
 * legitimately lowers overall unit coverage while improving the project. Letting
 * the ratchet pin them at today's 100% would guarantee an ADR every time an
 * adapter arrives, which would turn the rule into paperwork instead of a
 * safeguard. Their floors stay where the brief set them, and CI still enforces
 * those.
 *
 * The core layers are a different matter. `shared/` and `domain/` are pure and
 * fully testable in Node, so there is no honest reason for their coverage or
 * mutation score to fall, and those do ratchet.
 *
 * The maintainability index is absent for a related reason. It measures file
 * size far more than it measures difficulty — the lowest scores in this
 * repository belong to declarative tables with a cyclomatic complexity of 1 —
 * so ratcheting it encodes how small the codebase happened to be when it was
 * last measured, and then demands that every new adapter be fragmented to match.
 * Its floor is chosen deliberately in an ADR and raised by hand.
 */
const RATCHETABLE_GATES: Record<string, string> = {
  'coverage-lines-core': 'coverageLinesCore',
  'coverage-branches-core': 'coverageBranchesCore',
  mutation: 'mutationScore',
  tsdoc: 'tsdocCoveragePercentMin',
  duplication: 'duplicationPercentMax',
};

/** How each status is written in the Markdown report. */
const REPORT_LABEL: Readonly<Record<GateStatus, string>> = {
  pass: 'pass',
  fail: 'FAIL',
  skipped: 'skipped',
};

/** How each status is written in the aligned console table. */
const CONSOLE_LABEL: Readonly<Record<GateStatus, string>> = {
  pass: ' ok ',
  fail: 'FAIL',
  skipped: 'skip',
};

/**
 * Lists every TypeScript file under a directory.
 *
 * @param directory - Absolute path to walk.
 * @returns Absolute paths of every `.ts` file found, excluding declarations.
 */
function listTypeScriptFiles(directory: string): string[] {
  const found: string[] = [];

  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      const absolute = path.join(current, entry);
      if (statSync(absolute).isDirectory()) {
        walk(absolute);
      } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
        found.push(absolute);
      }
    }
  };

  walk(directory);
  return found;
}

/**
 * Measures every file under `src/`.
 *
 * @returns Per-file metrics, sorted worst-maintainability first.
 */
function measureSources(): FileMetrics[] {
  const sourceRoot = path.join(REPOSITORY_ROOT, 'src');
  return listTypeScriptFiles(sourceRoot)
    .map((absolute) =>
      measureFile(absolute, path.relative(REPOSITORY_ROOT, absolute).replaceAll('\\', '/')),
    )
    .toSorted((a, b) => a.maintainabilityIndex - b.maintainabilityIndex);
}

/**
 * Collects every gate.
 *
 * @param thresholds - The ratchetable thresholds.
 * @param metrics - Per-file source metrics.
 * @param isQuick - When true, the slow compiler-driven gates are skipped.
 * @returns Every gate, in report order.
 */
function collectAllGates(
  thresholds: Thresholds,
  metrics: readonly FileMetrics[],
  isQuick: boolean,
): Gate[] {
  const gates: Gate[] = [];

  if (!isQuick) {
    gates.push(collectTypecheck(REPOSITORY_ROOT), collectLint(REPOSITORY_ROOT));
  }

  gates.push(
    ...collectCoverage(REPOSITORY_ROOT, thresholds),
    collectMutationScore(REPOSITORY_ROOT, thresholds),
    ...collectSourceGates(metrics, thresholds),
    collectDuplication(REPOSITORY_ROOT, thresholds),
    ...collectArchitecture(REPOSITORY_ROOT),
    collectDeadCode(REPOSITORY_ROOT),
    collectBundleSize(REPOSITORY_ROOT),
    collectVulnerabilities(REPOSITORY_ROOT),
    collectLicenses(REPOSITORY_ROOT),
  );

  return gates;
}

/**
 * Renders the report as Markdown.
 *
 * @param gates - Every measured gate.
 * @param metrics - Per-file source metrics, worst first.
 * @param generatedAt - ISO timestamp for the report header.
 * @returns The Markdown document.
 */
function renderMarkdown(
  gates: readonly Gate[],
  metrics: readonly FileMetrics[],
  generatedAt: string,
): string {
  const rows = gates
    .map(
      (gate) =>
        `| ${gate.name} | ${gate.tool} | ${gate.value} | ${gate.threshold} | ${REPORT_LABEL[gate.status]} |`,
    )
    .join('\n');

  const failures = gates.filter((gate) => gate.status === 'fail');
  const skipped = gates.filter((gate) => gate.status === 'skipped');

  const detailSection = (title: string, list: readonly Gate[]): string =>
    list.length === 0
      ? ''
      : `\n## ${title}\n\n${list
          .map(
            (gate) =>
              `### ${gate.name}\n\n\`\`\`\n${gate.detail ?? '(no detail reported)'}\n\`\`\`\n`,
          )
          .join('\n')}`;

  const worstFiles = metrics
    .slice(0, 10)
    .map(
      (file) =>
        `| ${file.path} | ${file.maintainabilityIndex.toFixed(1)} | ${String(file.cyclomaticComplexity)} | ${String(file.physicalLines)} |`,
    )
    .join('\n');

  return `<!-- Generated by \`npm run qa\`. Do not edit by hand. -->
# Quality report

Generated ${generatedAt}

**${String(gates.filter((gate) => gate.status === 'pass').length)} passing**, **${String(failures.length)} failing**, ${String(skipped.length)} skipped.

| Metric | Tool | Measured | Gate | Status |
| --- | --- | --- | --- | --- |
${rows}
${detailSection('Failures', failures)}${detailSection('Skipped', skipped)}
## Ten least maintainable files

| File | Maintainability | Cyclomatic | Lines |
| --- | --- | --- | --- |
${worstFiles}

Thresholds live in \`scripts/qa/thresholds.json\` and only ever move up. Lowering
one requires an ADR with an issue link and an expiry date; see \`docs/quality.md\`.
`;
}

/**
 * Proposes tightened thresholds for gates the code has comfortably outgrown.
 *
 * @param gates - Every measured gate.
 * @param thresholds - The current thresholds.
 * @returns The thresholds that changed, keyed as in `thresholds.json`.
 */
function proposeRatchet(gates: readonly Gate[], thresholds: Thresholds): Thresholds {
  const keyForGate: Record<string, string> = RATCHETABLE_GATES;

  const tightened: Thresholds = {};

  for (const gate of gates) {
    const key = keyForGate[gate.id];
    if (key === undefined || gate.numeric === undefined || gate.status !== 'pass') {
      continue;
    }

    const { measured, threshold, direction } = gate.numeric;
    const current = thresholds[key] ?? threshold;

    if (direction === 'min' && measured - RATCHET_MARGIN > current) {
      tightened[key] = Math.floor(measured - RATCHET_MARGIN);
    } else if (direction === 'max' && measured + RATCHET_MARGIN < current) {
      tightened[key] = Math.ceil(measured + RATCHET_MARGIN);
    }
  }

  return tightened;
}

/**
 * Prints the gate table to the console.
 *
 * @param gates - Every measured gate.
 */
function printGates(gates: readonly Gate[]): void {
  const width = Math.max(...gates.map((gate) => gate.name.length));
  for (const gate of gates) {
    const label = CONSOLE_LABEL[gate.status];
    console.info(
      `  [${label}] ${gate.name.padEnd(width)}  ${gate.value}  (gate ${gate.threshold})`,
    );
    if (gate.status !== 'pass' && gate.detail !== undefined) {
      for (const line of gate.detail.split('\n')) {
        console.info(`           ${line}`);
      }
    }
  }
}

/**
 * Runs the report.
 */
function main(): void {
  const flags = new Set(process.argv.slice(2));
  const isQuick = flags.has('--quick');
  const shouldRatchet = flags.has('--ratchet');

  const thresholds = JSON.parse(readFileSync(THRESHOLDS_PATH, 'utf8')) as Thresholds;
  const metrics = measureSources();

  console.info('\nDemiurge quality report\n');
  const gates = collectAllGates(thresholds, metrics, isQuick);
  printGates(gates);

  const generatedAt = new Date().toISOString();
  mkdirSync(REPORT_DIRECTORY, { recursive: true });
  writeFileSync(
    path.join(REPORT_DIRECTORY, 'report.md'),
    renderMarkdown(gates, metrics, generatedAt),
    'utf8',
  );
  writeFileSync(
    path.join(REPORT_DIRECTORY, 'report.json'),
    `${JSON.stringify({ generatedAt, gates, thresholds, files: metrics }, undefined, 2)}\n`,
    'utf8',
  );

  const failures = gates.filter((gate) => gate.status === 'fail');
  const skipped = gates.filter((gate) => gate.status === 'skipped');

  console.info(
    `\n${String(gates.length - failures.length - skipped.length)} passed, ${String(failures.length)} failed, ${String(skipped.length)} skipped.`,
  );
  console.info('Report written to docs/quality/report.md and report.json\n');

  if (shouldRatchet && failures.length === 0) {
    const tightened = proposeRatchet(gates, thresholds);
    const keys = Object.keys(tightened);
    if (keys.length > 0) {
      writeFileSync(
        THRESHOLDS_PATH,
        `${JSON.stringify({ ...thresholds, ...tightened }, undefined, 2)}\n`,
        'utf8',
      );
      console.info('Ratchet tightened:');
      for (const key of keys) {
        console.info(`  ${key}: ${String(thresholds[key])} -> ${String(tightened[key])}`);
      }
      console.info('Commit scripts/qa/thresholds.json with this change.\n');
    }
  }

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main();
