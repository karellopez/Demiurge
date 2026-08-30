# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Version tags begin at phase 5; before that the project is pre-release and the
`Unreleased` section carries everything.

## [Unreleased]

### Added

- **Phase 4 (in progress) — body orientation.**
  - The IAU WGCCRE rotation model: a fixed pole and a prime meridian angle
    `W = W₀ + Ẇ·d`, giving every body a full body-fixed basis in ecliptic
    coordinates. Bodies are now oriented in the scene, so a pole points where it
    actually points and an oblate body is squashed along its own axis rather
    than along the world's.
  - `domain/frames.ts` — the one place the equatorial frame the IAU publishes
    poles in meets the ecliptic frame everything else lives in. Skipping that
    conversion tilts the whole system by 23.44°, which looks almost right.
  - Sub-solar point, terminator geometry and **local solar time**, which joins
    the stats card. Noon is where the star is overhead, and the sub-camera point
    is the place the card reports for.
  - `orbitNormal` on the propagator, and an `axialTilt` that measures against a
    body's own orbit and in its own direction of spin — the two things that make
    a computed tilt match a published one.

### Fixed

- **Mars's pole declination in the catalogue was wrong**: 54.432516° where the
  IAU 2015 report gives 52.8865°, with the right ascension out by 0.4° as well.
  It put Mars's axial tilt at 23.92° instead of 25.19°. Found by the new
  almanac tests on the first run. The corrected pole also sits 0.014° from
  Phobos's, which is where a Mars pole has to be — Phobos orbits in Mars's
  equatorial plane.
- The stats-card refresher built a fresh update object every frame. It now
  writes one it owns in place, which is what the zero-allocation rule asks for.

### Changed

- `computeBodyFacts` takes a record rather than five positional arguments, and
  the display formatting moved to `domain/body-format.ts`. The two change for
  different reasons: a number changes when the physics does, its wording when
  someone cannot read it.
- The mutation suite runs the rotation integration tests too.

### Added

- **Phase 3 — cameras, selection and scale.**
  - One camera rig with five modes, cycled with `C`: Orbit, Locked frame,
    Inertial, Sun-relative and Cinematic. Each holds a different thing still,
    which is the whole difference between them. Sun-relative is withheld when the
    Sun itself is followed — a star has no terminator — and the cycle skips it
    rather than offering a mode that does nothing.
  - **Nothing clips.** Orbit distance is measured in body radii rather than
    metres, because that is the only unit under which one number means the same
    thing at Phobos and at Jupiter. Zoom is exponential and clamped at 1.05
    radii; a test walks all twenty-five bodies at every zoom extreme and at every
    scale preset and asserts the camera stays outside the surface.
  - **Nothing snaps.** Selecting a body starts a timed transition — 0.8 s nearby,
    2 s across the system, log-scaled in radii, smoothstep-eased so it cannot
    overshoot. Selecting again mid-transition re-aims from where the camera
    actually is, so rapid clicking is a continuous path rather than a sequence of
    teleports. Tested as a discontinuity check on the per-frame step, not as a
    screenshot.
  - The up vector swings into the view plane within 2.6° of ecliptic north, so
    dragging over a pole does not snap the roll through a right angle.
  - **Body browser**: a quick bar for the Sun and the eight planets, a search box,
    and the full catalogue indented by what orbits what. Filtering keeps a
    match's ancestors, so a moon is never left orphaned under nothing. `B`
    toggles it; `[` and `]` walk the same order the list shows.
  - `BodyCatalog.inTreeOrder` — the catalogue flattened depth-first — so the list
    and the bracket keys cannot disagree about what "next" means. File order is
    not tree order, and a test asserts that they differ.
  - **Live stats card**: distance from camera and from the Sun, radius, mass,
    surface gravity against Earth's, rotation and orbital period. Mass is derived
    from the catalogued GM rather than stored, since GM is the measured quantity.
    Retrograde rotation is spelled out in words. Local solar time waits for the
    IAU rotation model in phase 4.
  - **Scale presets** on `1`, `2` and `3` — True scale, Orrery, Textbook —
    animating over 1.5 s, geometrically rather than linearly. Scale is a
    rendering transform and never a simulation one: it is applied once at the
    floating-origin boundary, so orbits, gravity and collision never see it.
  - Mouse drag orbits the camera and the wheel zooms, both restricted to the
    canvas so a click in the list stays a selection.
  - **The date says when it has left the fitted window.** The planetary elements
    are Standish's 1800–2050 fit, and at a year a second a player clears it in
    about twenty seconds — after which the positions degrade smoothly rather than
    failing, which is exactly what makes it dangerous. The readout now turns
    amber, gains a `≈` and carries a tooltip naming the window.
    `domain/orbits/validity.ts` is the one place those bounds are written down.
    The fit itself is deliberately not widened: see `docs/astronomy.md` for why
    an unverified wider table is worse than a narrow verified one.

### Changed

- The body browser moved from `J` to `B`, leaving `J` for the discovery journal
  the brief assigns it in phase 8.
- `camera-frame.ts` no longer carries a degenerate-cross-product fallback in
  `writeUp`: the branch is only reached within 2.6° of the z axis, where +x can
  never be parallel to the view, so the fallback was unreachable.
- The allocation gate now takes five samples and reports the smallest. Background
  heap growth during the measured loop can only ever add, so the minimum is the
  closest estimate of what the loop itself did — and a loop that genuinely
  allocates cannot produce a small sample at all. The single-sample version was
  flaky at the 2-bytes-per-iteration threshold.
- The mutation suite now runs the camera-rig and body-facts integration tests as
  well. Both are pure, and without them every camera-transition mutant survived.

### Removed

- `scene-capture.png`, an ad-hoc render capture taken while debugging the
  edge-on solar system in phase 2 and committed by accident. Nothing referenced
  it and it changed on every run; the pattern is now in `.gitignore`.

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
