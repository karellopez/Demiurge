# Quality

Quality is a number in this project. `npm run qa` measures every gate, writes
`docs/quality/report.md` and `report.json`, prints one table, and exits non-zero
if anything is red. CI publishes the same report as an artefact and as a sticky
pull-request comment.

```bash
npm run verify   # typecheck, lint, test with coverage, build, qa
npm run qa       # the gates alone, against the last build and coverage run
npm run qa -- --quick     # skip typecheck and lint for a fast local read
npm run qa -- --ratchet   # after a green run, tighten what the code outgrew
```

## The gates

| Metric                                             | Tool                                       | Gate                             |
| -------------------------------------------------- | ------------------------------------------ | -------------------------------- |
| Type safety                                        | `tsc --noEmit`, strict                     | zero errors                      |
| Lint                                               | ESLint + sonarjs, unicorn, import-x, jsdoc | zero errors, zero warnings       |
| Coverage — lines / branches, overall               | Vitest v8                                  | ≥ 80% / ≥ 75%                    |
| Coverage — lines / branches, `shared/` + `domain/` | Vitest v8                                  | ≥ 98% / ≥ 98% (ratcheted)        |
| Mutation score, `shared/` + `domain/`              | Stryker                                    | ≥ 98% (ratcheted)                |
| Cyclomatic complexity                              | ESLint `complexity`                        | ≤ 10 per function                |
| Cognitive complexity                               | `sonarjs/cognitive-complexity`             | ≤ 15 per function                |
| Maintainability index                              | `scripts/qa/source-metrics.ts`             | ≥ 60 per file, worst 10 reported |
| File and class size                                | `scripts/qa/source-metrics.ts`             | ≤ 400 lines / ≤ 200 lines        |
| Code duplication                                   | `jscpd`                                    | < 2% of lines (ratcheted)        |
| Circular dependencies                              | `dependency-cruiser`                       | **0**                            |
| Architecture violations                            | `dependency-cruiser`                       | **0**                            |
| Dead code, unused exports, unused deps             | `knip`                                     | **0**                            |
| TSDoc coverage on exported API                     | `scripts/qa/source-metrics.ts`             | ≥ 98% (ratcheted)                |
| Bundle size — initial JS, gzip                     | `size-limit`                               | ≤ 300 kB                         |
| Bundle size — total JS, gzip                       | `size-limit`                               | ≤ 1.5 MB                         |
| Known vulnerabilities                              | `npm audit --omit=dev` + CodeQL            | 0 high or critical               |
| Licence compliance                                 | `license-checker`                          | allowlist only                   |
| Frame-time regression                              | `npm run bench:flythrough`                 | p95 ≤ baseline + 10%             |

Thresholds live in `scripts/qa/thresholds.json`.

## The ratchet

Thresholds are **floors that only move up**.

When a metric has comfortably beaten its floor, `npm run qa -- --ratchet` rewrites
`thresholds.json` with the tightened value (measured, minus a two-point margin
for noise) and prints what it changed. Commit that file with the work that earned
it.

Lowering any threshold requires an ADR in `docs/adr/` stating why, linking an
issue, and giving an expiry date. There is exactly one such ADR today
(`0003`, the maintainability index floor).

**What the ratchet does not touch.** The two whole-project coverage numbers and
the maintainability index keep deliberately chosen floors and are never tightened
automatically. They move with the _ratio_ of pure logic to adapter code rather
than with quality: landing a WebGL renderer, which Playwright exercises and
Vitest cannot, legitimately lowers overall unit coverage while improving the
project. Pinning them at today's 100% would guarantee an ADR every time an
adapter arrives, turning the rule into paperwork instead of a safeguard.

The maintainability index is excluded for the reason given in ADR 0003c: it
measures file size far more than difficulty, so ratcheting it would demand that
every new adapter be fragmented to match whatever the codebase looked like when
it was last measured.

The core layers are different. `shared/` and `domain/` are pure and fully
testable in Node, so there is no honest reason for their coverage or mutation
score to fall, and those ratchet freely — they sit at 98% today.

**Equivalent mutants.** A few mutants cannot be killed because they do not change
observable behaviour — mutating a pure cache is the usual case, since removing
the cache entirely gives identical answers, only slower. Those are marked at the
site with `// Stryker disable next-line all: <why>` and a sentence explaining why
no test could tell the difference. That is a claim a reviewer can check, unlike a
lowered threshold.

Inline rule suppressions follow the same principle: a bare `eslint-disable` fails
lint. Every suppression must read

```ts
// eslint-disable-next-line rule-name -- why, and a link to the issue
```

## A skipped gate is not a passing gate

Anything the report could not measure is printed as **skipped**, with the reason,
and is never counted as a pass. Mutation testing is the usual one — it is far too
slow for the per-commit loop, so it runs nightly in `quality.yml` and the report
picks up whatever it last left on disk. Bundle size skips when `dist/` is absent;
coverage skips when nothing has written `coverage-summary.json` yet.

This is deliberate. A benchmark that silently measures nothing is worse than no
benchmark, because it looks green.

## How the in-repo metrics are computed

Three gates have no off-the-shelf tool that understands modern TypeScript, so
`scripts/qa/source-metrics.ts` computes them from the compiler's AST. See
`docs/adr/0003-toolchain-deviations.md` for why the named tool was not used.

**Maintainability index** is Coleman–Oman:

```
MI = max(0, 171 − 5.2·ln(V) − 0.23·G − 16.2·ln(LLOC))
```

where `V` is Halstead volume, `G` is total cyclomatic complexity, and `LLOC` is
_logical_ lines — statements and declarations, not physical lines, so a file is
not punished for carrying the TSDoc these standards require.

Two things about this number are easy to get wrong. It is on the original 0–171
scale, not normalised to 0–100: Visual Studio divides by 171, but it also
measures IL instructions rather than source, and on the normalised scale no real
file can reach 70. And it measures _size_ more than difficulty — the lowest
scores in this repository belong to a unit-conversion table and a tier budget
table, both with a cyclomatic complexity of 1. Read a low score as "this file is
large", check whether it is large for a reason, and move on if it is.

**TSDoc coverage** counts exported declarations carrying a leading `/** */` block,
across every file in `src/`.

**Class and file length** are physical lines, matching what the `max-lines` lint
rule counts.

## Running the pieces individually

```bash
npm run typecheck        # both TypeScript projects
npm run lint             # zero warnings tolerated
npm run test:coverage    # unit, integration, and the allocation tests
npm run depcruise        # architecture and cycles
npm run knip             # dead code
npm run jscpd            # duplication
npm run size             # bundle budget, needs a build first
npm run mutation         # Stryker; slow, nightly in CI
npm run audit:licenses   # licence allowlist
npm run bench:flythrough # frame-time regression
```

`npm run verify` runs the sequence CI runs. Note the order: `build` comes before
`qa`, because the bundle-size gate needs something to measure.

## Definition of done

For any unit of work:

- behaviour implemented, with tests written first or alongside;
- `npm run verify` green;
- `docs/` and `CHANGELOG.md` updated for anything user-visible;
- an ADR added if an architectural choice was made;
- the benchmark re-run if a hot path was touched.
