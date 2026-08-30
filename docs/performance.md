# Performance

The weakest tier is the design target, not a fallback. A feature that cannot
degrade onto a 2017 laptop with Intel integrated graphics does not ship.

## Tiers

| Tier       | Reference hardware                     | Target                             |
| ---------- | -------------------------------------- | ---------------------------------- |
| **Potato** | Intel UHD 620, 4 cores, 8 GB, 1366×768 | 30 fps locked, no frame over 50 ms |
| **Low**    | Intel Iris Xe / Vega 8, 1080p          | 60 fps, p95 ≤ 18 ms                |
| **Medium** | GTX 1650 / M1, 1080p                   | 60 fps, p95 ≤ 14 ms                |
| **High**   | RTX 3060+, 1440p                       | 60 fps, p95 ≤ 12 ms                |

The budgets are in code, in `src/domain/quality-tier.ts`, so the terrain
streamer, the post-process graph and the benchmark all read the same numbers and
a test can assert against them without a WebGL context.

| Tier   | Draw calls | Texture budget | Terrain vertex spacing |
| ------ | ---------- | -------------- | ---------------------- |
| Potato | ≤ 400      | 128 MiB        | ~2 m                   |
| Low    | ≤ 700      | 256 MiB        | ~1 m                   |
| Medium | ≤ 1100     | 512 MiB        | ~0.5 m                 |
| High   | ≤ 1500     | 1 GiB          | ~0.5 m                 |

## Tier detection

Detected at boot from the WebGL renderer string, `deviceMemory`,
`hardwareConcurrency` and a short GPU micro-benchmark, then **always overridable
in settings without a reload**. The detected tier and the reason for it are
printed to the console and shown in settings, so a performance report from a
player carries the same evidence the settings panel shows.

Every ambiguous signal rounds _downward_. Misjudging an RTX 3060 as Medium costs
a little fidelity; misjudging a UHD 620 as High costs a slideshow before the
player ever reaches the settings menu. When a renderer string matches more than
one class — "Radeon RX Vega 64" carries both a midrange and a strong marker — the
weaker reading wins.

The micro-benchmark outranks the renderer string, because the name is a label
the driver chose and the benchmark is a measurement.

## Measuring

```bash
npm run bench:flythrough                      # compare against the baseline
npm run bench:flythrough -- --update-baseline # re-baseline deliberately
DEMIURGE_TIER=potato npm run bench:flythrough # a specific tier
npm run bench                                 # micro-benchmarks
```

The flythrough replays a deterministic path at a fixed seed and fixed timestep,
then compares p95 against `tests/bench/baselines/<tier>.json`. A regression
beyond 10% fails the run.

Stages become measurable as the systems behind them land. A stage with no systems
yet reports **pending** and contributes no numbers — it never contributes a fast,
meaningless zero, because a benchmark that silently measures nothing is worse
than no benchmark.

| Stage                                | Available from |
| ------------------------------------ | -------------- |
| `space` — system view                | phase 2        |
| `orbit` — low orbit, clouds and limb | phase 5        |
| `descent` — atmospheric entry        | phase 7        |
| `landing` — final approach           | phase 7        |
| `walk` — on foot across two biomes   | phase 8        |
| `combat` — sustained beam fire       | phase 9        |
| `destruction` — the full sequence    | phase 9        |

`F3` shows the same figures live in the running simulation.

## Allocation

GC pauses are the main cause of stutter in a WebGL game, so the frame loop
allocates nothing. This is a CI-tracked metric, not a habit:
`tests/bench/allocation.test.ts` runs 600 frames of each hot path and asserts
heap growth of effectively zero per frame.

The test needs `--expose-gc` to read the heap reliably. The `perf` Vitest project
passes it. Without it the suite reports itself as **skipped** rather than passing
on a measurement it could not take.

## Profiling

- **Spector.js** for a frame capture: draw calls, state changes, shader source,
  and which pass is actually expensive. The browser extension is the fastest way
  in.
- **Chrome tracing** (`chrome://tracing`, or the Performance panel with GPU
  enabled) for the CPU/GPU split and to see whether a hitch is a shader compile,
  a texture upload, or a collection.
- **`F3`** in the running simulation for live percentiles, draw calls, triangles,
  patch queue depth and heap delta against the tier budget. Counts over budget
  are shown in red.

Every optimisation is recorded here with before-and-after numbers. An
optimisation without a measurement is a guess.

## Optimisation record

_Phase 0 established the harness; the first entries arrive with the renderer in
phase 4._

| Date | Change | Tier | Before (p95) | After (p95) |
| ---- | ------ | ---- | ------------ | ----------- |
| —    | —      | —    | —            | —           |

## Deploying elsewhere

The build assumes a GitHub Pages project path (`/Demiurge/`). For a host that
serves from a domain root — Cloudflare Pages, Netlify — build with:

```bash
DEMIURGE_BASE=/ npm run build
```

See `docs/adr/0004-github-pages-base-path.md`.

`SharedArrayBuffer` is **forbidden**: GitHub Pages cannot set the COOP/COEP
headers it requires. The worker pool communicates with transferable
`ArrayBuffer`s only. This works locally without the headers in some
configurations and then fails on deploy, so it must not be reached for during
terrain-streaming optimisation.
