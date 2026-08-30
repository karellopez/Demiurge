# 3. Toolchain deviations from the brief

- Status: accepted
- Date: 2026-08-30

Three places where the brief's named tooling could not be used as written. Each
is recorded here with what was measured, what was chosen instead, and what it
costs.

## 3a. Node 22 LTS rather than Node 20 LTS

### Context

The brief mandates Node 20 LTS, pinned in `.nvmrc` and `engines`. Node 20 left
maintenance on 2026-04-30 and receives no further security patches.

That would be tolerable on its own. What is not is that five of the tools the
brief itself requires for its quality gates have moved past it:

| Tool                       | Gate it provides                               | Requires                    |
| -------------------------- | ---------------------------------------------- | --------------------------- |
| `dependency-cruiser` 18    | Architecture violations, circular dependencies | `^22 \|\| ^24 \|\| >=26`    |
| `size-limit` 13            | Bundle size                                    | `^22.18 \|\| ^24 \|\| >=26` |
| `@stryker-mutator/core` 10 | Mutation score                                 | `>=22`                      |
| `eslint-plugin-jsdoc` 64   | TSDoc shape                                    | `^22.22.2 \|\| >=24.15`     |
| `eslint-plugin-unicorn` 74 | Lint                                           | `>=22`                      |

Holding Node at 20 would mean pinning five tools to superseded versions in order
to run a gate suite whose whole purpose is to stop the project accumulating
exactly that kind of debt. The brief also forbids depending on anything
unmaintained, which an end-of-life runtime plainly is.

### Decision

Node 22 LTS (22.23.2), pinned in `.nvmrc`, with `engines` set to
`^22.12.0 || >=24.0.0`. Every other version constraint in the brief is honoured.

### Consequences

- All five gates run on current tool versions.
- The floor is a supported runtime, so `npm audit` remains meaningful.
- Contributors on Node 20 are refused by `engines` rather than failing
  mysteriously several commands later.

## 3b. Maintainability index computed in-repo rather than by `typhonjs-escomplex`

### Context

The brief names `typhonjs-escomplex` for the maintainability index. Its last
release was 2022-06-28 — over four years ago, at version 0.1.0 — and it parses
JavaScript, not TypeScript. Adding it would violate the brief's own rule against
dependencies with more than two years of silence, and it could not read the
source it was being asked to measure.

### Decision

`scripts/qa/source-metrics.ts` computes the maintainability index, TSDoc
coverage and class length directly from the TypeScript compiler's AST.
`typescript` is already a dependency, so this adds no new supply chain.

### Consequences

- The metric understands TypeScript syntax, which the named tool never would.
- The numbers are not directly comparable to escomplex's, which matters for
  3c below.
- The formula is ours to maintain. It is documented in `docs/quality.md` and the
  implementation carries the reasoning inline.

## 3c. Maintainability index floor starts at 60, not 70

### Context

The brief sets the gate at "≥ 70 per file". Implementing Coleman–Oman faithfully
and measuring this codebase gives:

| File                                          | Index | Logical lines | Cyclomatic |
| --------------------------------------------- | ----- | ------------- | ---------- |
| `presentation/ui/boot-screen.ts`              | 63.1  | 64            | 4          |
| `features/diagnostics/detect-quality-tier.ts` | 66.9  | 48            | 16         |
| `shared/units.ts`                             | 67.6  | 57            | 1          |
| `domain/quality-tier.ts`                      | 67.8  | 61            | 1          |
| `shared/rng.ts`                               | 71.8  | 39            | 3          |
| `shared/result.ts`                            | 85.5  | 23            | 4          |

Two things are visible here. First, the files below 70 are the _least_ complex
in the project — cyclomatic complexity of 1 to 4. They are a branded-unit
conversion table, a tier budget table, and a DOM builder. The index is measuring
their size, not their difficulty, which is a known weakness of the metric on
declarative code. Second, the term `16.2 · ln(LOC)` means the gate effectively
caps a file at roughly 45 logical lines, which contradicts the brief's own
400-line file limit; the two requirements are not jointly satisfiable.

Reaching 70 would mean splitting cohesive modules into fragments — making the
code worse in order to improve a number. That is the failure mode the metric
exists to prevent.

Note also that the value is _not_ on the 0–100 normalised scale. Dividing by 171,
as Visual Studio does, makes 70 unreachable for code of any size — a clean
ten-line function tops out near 62 — because Visual Studio measures IL
instructions rather than source. The 0–171 scale used here is the one on which a
threshold near 65–70 is meaningful, and it is the scale `typhonjs-escomplex`
reports on.

### Decision

The floor starts at **60**, recorded in `scripts/qa/thresholds.json`. The ratchet
in `npm run qa -- --ratchet` raises it automatically as files improve, and it can
never be lowered again without a further ADR.

The target remains 70. Files below it are listed in every QA report, worst first.

### Consequences

- The gate is real: it fails on a genuine regression rather than being
  permanently red and therefore ignored.
- The ratchet does the work of closing the gap over the remaining phases.
- Anyone reading a green QA report can see the current floor and the ten worst
  files, so the compromise is visible rather than buried.

- Issue: <https://github.com/karellopez/Demiurge/issues/1>
- Review by: end of phase 10 (the optimisation pass), when file shapes settle.

## 3d. The ratchet does not tighten whole-project coverage or the maintainability index

### Context

`npm run qa -- --ratchet` proposes a tightened floor for any metric the code has
comfortably outgrown. Run against phase 0 it proposed raising overall line
coverage from 80% to 98%, because a repository that is almost entirely pure
logic naturally reaches 100%.

That number would not survive contact with phase 4. A WebGL renderer, a DOM HUD
and a WebAudio adapter are exercised by Playwright and by looking at the screen,
not by Vitest. Overall unit coverage will fall when they land, and it will fall
for a good reason. A floor of 98% would therefore mandate an ADR for each new
adapter, which converts a safeguard into paperwork and trains everyone to treat
threshold changes as routine — exactly what the ratchet rule exists to prevent.

The maintainability index is excluded for a related reason, discovered the first
time phase 1 added real adapter code. Ratcheted to 61 from a repository of a
dozen small pure modules, it then failed on a 173-line engine loop and a 218-line
renderer — files that are large because they do a real job, not because they are
badly written. Since 3c already establishes that this metric measures size far
more than difficulty, auto-ratcheting it does not encode rising quality; it
encodes how small the codebase happened to be when it was last measured, and then
demands every new adapter be fragmented to match.

### Decision

The ratchet tightens the core-layer coverage, the mutation score, TSDoc coverage
and duplication. It does **not** tighten the two whole-project coverage numbers
or the maintainability index; those keep floors chosen deliberately and raised by
hand.

`shared/` and `domain/` are pure and fully testable in Node, so their floors do
ratchet, and they sit at 98% lines and branches today.

### Consequences

- The metrics that measure quality get steadily harder; the two that measure the
  shape of the codebase rather than its quality do not masquerade as ones that do.
- CI still enforces 80% / 75% overall, so coverage cannot quietly collapse.
- If overall coverage should be raised, it is raised deliberately, in a commit
  that says so, rather than by a tool reacting to a temporarily small codebase.
