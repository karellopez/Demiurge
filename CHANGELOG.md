# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Version tags begin at phase 5; before that the project is pre-release and the
`Unreleased` section carries everything.

## [Unreleased]

### Added

- **Phase 0 — repository and quality rig.**
  - Five-layer architecture with machine-enforced boundaries: `app` to
    `presentation` to `features` to `domain` to `shared`, dependencies inward
    only, checked by `dependency-cruiser` with every illegal edge a named rule.
  - `npm run qa` measures nineteen quality gates, writes
    `docs/quality/report.md` and `report.json`, and fails the build on any red
    gate. Anything it could not measure is reported as skipped, never as a pass.
  - A ratchet: `npm run qa -- --ratchet` tightens thresholds the code has
    outgrown. Lowering one requires an ADR with an issue link and an expiry date.
  - `shared/units.ts` — branded numeric units, so metres and kilometres cannot
    be mixed at compile time.
  - `shared/result.ts` — `Result<T, E>` for expected failures.
  - `shared/rng.ts` — deterministic `sfc32` generator with forkable named
    sub-streams, so generation order cannot affect the world.
  - `shared/statistics.ts` — frame-time percentiles by nearest rank.
  - `domain/quality-tier.ts` — the four tiers and their budgets.
  - `domain/session-seed.ts` — speakable seed phrases, canonicalised so a shared
    link survives being capitalised.
  - Boot path: WebGL2 capability probe, tier detection with a plain-language
    reason, and a title screen showing the seed, tier, frame target, draw-call
    budget and terrain detail.
  - `tests/bench/allocation.test.ts` — asserts the per-frame hot paths allocate
    effectively nothing, verified with a forced collection rather than assumed.
  - `scripts/bench-flythrough.ts` — deterministic frame-time benchmark with
    per-tier baselines and a 10% regression gate. Stages with no systems behind
    them yet report as pending rather than contributing a meaningless zero.
  - Playwright smoke and visual-regression suites, run against a production
    build at the real GitHub Pages base path.
  - CI: typecheck, lint, format, coverage, build, quality gates, e2e, visual
    regression, benchmark, CodeQL, and a guarded Pages deploy.
  - Full community-health set: issue and pull-request templates, `CODEOWNERS`,
    Dependabot with grouped updates, labeler.
  - ADRs 0001–0004.

### Notes

- The maintainability-index floor starts at 60 rather than the 70 the brief
  specifies. The metric and the brief's own 400-line file limit are not jointly
  satisfiable, and the files below 70 are the least complex in the project. The
  ratchet closes the gap. See `docs/adr/0003-toolchain-deviations.md`.
- Node 22 LTS is used rather than Node 20, which is end-of-life and blocked five
  of the required gate tools. Same ADR.
