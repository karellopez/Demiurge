# Working on Demiurge

Context for whoever picks this up next. Read this before touching anything.

## The brief

The specification is `../demiurge_agent_prompt.md` (i.e. one level above this
repo, at `the_universe_project/demiurge_agent_prompt.md`). It defines twelve
build phases, five architectural layers with machine-enforced boundaries, about
nineteen measured quality gates, and four performance tiers. It is the source of
truth for scope; this file only records where the work has got to.

## Hard constraints

- **Commits must not name Claude.** No `Co-Authored-By: Claude` trailer, no
  "Generated with Claude Code" footer. This was asked for explicitly, twice.
- Conventional Commit subjects. Bodies explain _why_, in prose.
- `npm run verify` must be green before every commit.

## Toolchain

Node **22.23.2** (not the brief's Node 20, which is EOL and blocks five gate
tools — see `docs/adr/0003-toolchain-deviations.md`). In Git Bash, node is not on
the default PATH; prefix commands with:

```sh
export PATH="$PATH:/c/Program Files/nodejs"
```

## The commands that matter

| Command                    | What it is                                                              |
| -------------------------- | ----------------------------------------------------------------------- |
| `npm run verify`           | The gate. Typecheck, lint, data validation, coverage, build, QA report. |
| `npm run qa`               | Just the eighteen-gate report (`docs/quality/report.md`).               |
| `npm run mutation`         | Stryker. **Not** in `verify`; the QA report reads its last run.         |
| `npm run test:visual`      | Playwright, real GPU. 16 specs.                                         |
| `npm run test:e2e`         | Playwright smoke. 5 specs.                                              |
| `npm run bench:flythrough` | Frame-time baselines.                                                   |

`npm run mutation` reads `vitest.mutation.config.ts`. **When you add a pure
integration test that is the only thing covering some domain code, add it to
that config's `include` list**, or every mutant in that code survives and the
mutation gate drops. This has bitten twice already.

## Where the work has got to

Phases 0, 1, 2 and 3 are **done, committed and pushed**. Phase 4 is in progress.

| #    | Phase                                               | State           |
| ---- | --------------------------------------------------- | --------------- |
| 0    | Repo and quality rig                                | done            |
| 1    | Foundation — loop, f64, floating origin, depth      | done            |
| 2    | Solar system — data, Kepler, orbit lines, time warp | done            |
| 3    | Cameras — rig, modes, transitions, selection, scale | done            |
| 4    | Rendering                                           | **in progress** |
| 5–11 | Atmospheres … release                               | not started     |

### Phase 4 — what is done

One slice, committed as `feat(render): orient every body by the IAU rotation
model`:

- `src/domain/frames.ts` — the equatorial ↔ ecliptic rotation. The IAU publishes
  poles in the equatorial frame; everything else here is ecliptic. This is the
  only place the two meet.
- `src/domain/rotation.ts` — the WGCCRE model: pole, `W = W₀ + Ẇ·d`, body-fixed
  basis, sub-solar point, local solar time, `axialTilt`.
- `orbitNormal` added to `src/domain/orbits/propagate.ts`.
- Bodies are oriented in the scene (`createVisualOrienter` in
  `solar-system-scene.ts`), so poles point where they point and oblate bodies are
  squashed along their own axis.
- Local solar time is on the stats card.
- **Fixed a real data bug**: Mars's catalogued pole was wrong (54.432516° where
  the IAU 2015 report gives 52.8865°). The almanac tests caught it.

### Phase 4 — what is left

Working from §10 of the brief. Suggested order, since each unblocks the next:

1. **Analytic eclipse and body shadows** — sphere-vs-sphere penumbra/umbra per
   pixel, so Io shadows Jupiter's clouds and lunar eclipses land on the right
   dates. This is the phase's stated acceptance criterion: _"a real eclipse date
   reproduces the correct shadow"_. Do the geometry as a pure domain function
   (`domain/lighting/eclipse.ts`) and verify it against a real eclipse date —
   2017-08-21 is the obvious one — before any shader work. Ring shadows both ways.
2. **HDR pipeline** — `HalfFloat` targets, linear workflow, sRGB at final write,
   **AgX** tonemapping (three.js r185 has `AgXToneMapping` built in), exposure
   control, histogram auto-exposure (~1 s up, ~2 s down, clamped so an explosion
   cannot black out the frame). The exposure controller is pure and belongs in
   domain.
3. **TAA** with velocity buffer and neighbourhood clamping, SMAA as the low-tier
   fallback, jitter-off debug toggle. Mandatory: starfields and rings alias badly.
4. **Post chain** — mip-chain bloom (no threshold hack), occlusion-tested lens
   flare, optional DOF (cinematic camera only), motion blur off by default,
   grain, vignette, chromatic aberration (aberration only on damage/entry heat,
   disabled under reduced motion).
5. **PBR surfaces and real textures** — `npm run assets:fetch` and
   `npm run build:textures` already exist and are wired to `data/assets.json`;
   nothing fetched is ever committed, and the procedural path is a supported
   configuration rather than a fallback. Triplanar at the poles, normals from
   height derivatives, parallax occlusion near the camera, stochastic tiling.
6. **Sun shader** — limb darkening, granulation, chromosphere rim, corona,
   screen-space glare driving the bloom.
7. **Rings** — radial opacity/colour from real profiles, forward-scatter when
   backlit, backscatter when front-lit.
8. **Star catalogue** — real bright stars, RA/Dec → ecliptic (use
   `domain/frames.ts`), apparent magnitude → luminance, B−V → colour temperature,
   GPU points with a physical PSF over a low-intensity Milky Way cubemap.
   Needs a data file; nothing is fetched yet.
9. Commit visual regression baselines.

Everything in §10 must degrade across all four tiers, and the brief is explicit
that the fallback is designed at the same time as the feature, not afterwards.

## Things learned the hard way

- **The ecliptic frame is XY with +Z north.** three.js assumes Y-up. The camera
  needs `camera.up.set(0, 0, 1)`, and a `SphereGeometry` has its poles on local
  +Y, which is why the orienter maps local +Y to the body's pole.
- **Scale is a rendering transform, never a simulation one.** It is applied once
  at the floating-origin boundary. Orbits, gravity and collision never see it.
- **Bash heredocs eat backslashes.** For any file containing a regex or an
  escape, use the Write/Edit tools or a Python heredoc, not `cat <<EOF`.
- **The maintainability-index gate runs tight.** The floor is 50 and the worst
  file usually sits in the low fifties. When a module grows past ~200 lines it
  will trip; split it along a real seam rather than shuffling code.
- **knip** is strict on values and lenient on types that a file's own exported
  signatures name (`ignoreExportsUsedInFile`, types only). An exported function
  nothing imports is a gate failure — delete it or use it.
- **The allocation gate takes the best of five samples.** Background heap growth
  during the measured loop can only add, so the minimum is the honest estimate.
  Do not "fix" a flaky allocation result by raising the threshold.
- The quality ratchet only moves floors **up**. Lowering one needs an ADR.

## Deferred, on purpose

- The planetary elements are Standish's 1800–2050 fit. The readout marks the date
  once it leaves that window. The fit is **not** widened, because the committed
  JPL Horizons fixtures only span 1900–2050 and a wider table with nothing to
  check it against would be an unverified accuracy claim. Extending the fixtures
  comes first. See `docs/astronomy.md`.
- `DEPLOY_PAGES=true` must be set in the repository variables before GitHub Pages
  will deploy.
- Linux Playwright visual baselines are generated by CI on its first run and need
  committing.
