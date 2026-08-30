# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Version tags begin at phase 5; before that the project is pre-release and the
`Unreleased` section carries everything.

## [Unreleased]

### Added

- **Phase 2 — the solar system.**
  - `data/bodies.json`: twenty-five bodies — the Sun, eight planets, Pluto,
    Ceres, Eris and thirteen moons — with radii, GM, rotation, pole and prime
    meridian from the NASA fact sheets and the IAU WGCCRE report, and orbital
    elements cited per body. Validated against a JSON Schema _and_ a set of
    invariants JSON Schema cannot express (one root, no cycles, no dangling
    parent, no prolate body, no ring inside its planet) by `npm run validate:data`,
    which is now a gate.
  - Keplerian propagation: Newton–Raphson below e = 0.9 and Halley above it,
    tolerance 1e-12, with a capped iteration that reports its best estimate
    rather than looping. Measured worst case across the whole (M, e) space is
    seven iterations; the cap is never reached.
  - **Accuracy measured against JPL Horizons.** Twenty-seven real state vectors,
    nine bodies on three dates spanning 1900–2050, committed as fixtures.
    Eight of nine planets are inside 0.1° of heliocentric longitude; Saturn is at
    0.151° and carries a stated tolerance of its own with the reason. See
    `docs/astronomy.md`.
  - Moons ride with their planets: orbits accumulate down the catalogue tree, so
    Io's heliocentric position is its own orbit about Jupiter plus Jupiter's
    about the Sun.
  - The space view: every body drawn at true size and lit by the Sun with
    physical inverse-square falloff, oblate where the catalogue says so, plus an
    additive glare that makes a body visible when its geometry is sub-pixel.
    Orbit lines are sampled from the same propagator that places the body, so a
    planet drifting off its own path would be a visible bug.
  - Time warp: a seven-rung ladder from paused to a year a second, mirrored in
    reverse, with `,` `.` to step, `R` to reverse and `P` to pause. Pausing
    remembers its place on the ladder.
  - A persistent bottom bar showing the seed, the simulated UTC date and the
    rate. Paused and reversed are marked with a symbol and weight as well as
    colour.
  - The title screen now waits for a keypress instead of vanishing, with the
    simulation already running behind it.
  - `npm run fixtures:horizons` regenerates the accuracy fixtures from JPL.

### Added

- **Phase 1 — foundation.**
  - Floating origin. Simulation positions are f64 metres; each frame the
    camera's position becomes the render origin and everything is drawn at
    `f32(world − camera)`. Subtraction happens in f64, the cast afterwards; that
    ordering is the whole technique. A point at 4.5e12 m round-trips to within a
    millimetre, and a camera creeping forward a centimetre per frame moves a
    distant point smoothly rather than in 500 km snaps.
  - Fixed-step accumulator at 120 Hz with a five-substep cap and a
    spiral-of-death guard that discards debt rather than carrying it, so a tab
    restored after ten minutes costs one slow frame instead of a locked tab.
    Simulated time agrees to within one step at 60 Hz and at 144 Hz.
  - `shared/math/vec3.ts` — double-precision vectors with an out-parameter
    convention, so no frame-loop operation allocates.
  - `shared/frame-window.ts` — a pre-allocated rolling window of frame times,
    shared by the F3 overlay and, from phase 10, the adaptive quality controller.
  - The engine: a fixed-step simulation driving a variable-step render, with the
    timing policy in pure domain code and only the mutable accumulator in the
    feature layer.
  - A logarithmic depth buffer, spanning 0.01 m to 1e13 m in one pass
    (ADR 0005).
  - The phase-1 acceptance scene: a one-metre cube six metres away, a
    hundred-kilometre sphere ten thousand kilometres away, and a one-metre cube
    at 4.5e12 m, all in one frame, stable and free of z-fighting. The first two
    are visible six orders of magnitude apart; the third is submitted and stable
    but sub-pixel, which is the physical fact that motivates glare impostors.
  - The F3 statistics overlay: frame time, p50/p95/p99, draw calls and triangles
    against the tier budget, steps run and simulated time abandoned. Readings
    over budget are marked with weight and a symbol as well as colour.

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
