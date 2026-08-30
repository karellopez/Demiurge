# Demiurge

[![CI](https://github.com/karellopez/Demiurge/actions/workflows/ci.yml/badge.svg)](https://github.com/karellopez/Demiurge/actions/workflows/ci.yml)
[![Quality report](https://github.com/karellopez/Demiurge/actions/workflows/quality.yml/badge.svg)](https://github.com/karellopez/Demiurge/actions/workflows/quality.yml)
[![CodeQL](https://github.com/karellopez/Demiurge/actions/workflows/codeql.yml/badge.svg)](https://github.com/karellopez/Demiurge/actions/workflows/codeql.yml)
[![Initial JS ≤ 300 kB](https://img.shields.io/badge/initial%20JS-%E2%89%A4%20300%20kB-blue)](docs/quality.md)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A physically grounded solar system in a browser tab. Real orbits, real radii,
real light. Fly down to any of them, land without a loading screen, get out and
walk. Then, if you like, take it apart with a beam weapon and watch its moons
lose their primary and drift away along their velocity vectors.

The demiurge is the craftsman-god who shapes the material world with his hands,
rather than a remote creator who set it going and left. That is the register the
whole thing is written in: reverent about the cosmos, unbothered about destroying
it.

> **Build status: phase 2 of 11 complete.** Twenty-five bodies orbit in their
> real places, checked against JPL Horizons on every test run, with time warp
> from paused to a year a second in both directions. The cameras, the render
> pipeline, the surface world and the weapons arrive across the phases below.
> `docs/` describes the design each phase is built against, and marks clearly
> what is not yet real.

## Sixty-second start

```bash
git clone https://github.com/karellopez/Demiurge.git
cd Demiurge
npm ci
npm run dev          # http://localhost:5173
```

Node 22 LTS or newer is required — the version is pinned in `.nvmrc`. There is no
server, no login, no telemetry, and no account. Everything runs in the tab.

```bash
npm run verify       # typecheck, lint, test with coverage, build, quality gates
npm run build        # static site into dist/
npm run preview      # serve the production build at the real Pages base path
```

## Three things it will not trade away

1. **It must be beautiful and correct** — real astronomy, modern rendering.
2. **It must be a high-quality codebase** — enforced architecture, measured
   quality, thresholds that only move up.
3. **It must be smooth on weak hardware** — a 2017 laptop with Intel integrated
   graphics is a first-class target, not an afterthought.

None of the three is allowed to pay for another. A feature that cannot degrade
onto the weakest tier does not ship.

## Controls

| Key                      | Action                 |
| ------------------------ | ---------------------- |
| `WASD`, `Space` / `Ctrl` | Translate              |
| Mouse                    | Look                   |
| `Q` / `E`                | Roll                   |
| `Shift`                  | Boost                  |
| `X`                      | Warp                   |
| `F`                      | Fun mode               |
| `C`                      | Cycle camera           |
| `T`                      | Target                 |
| `[` / `]`                | Cycle bodies           |
| `B`                      | Body browser           |
| `1` / `2` / `3`          | Scale presets          |
| `L`                      | Landing assist         |
| `G`                      | Gear                   |
| `E`                      | Exit or board the ship |
| `V`                      | Scanner                |
| `J`                      | Journal                |
| `Tab`                    | Parameters             |
| `H`                      | Hide HUD               |
| `M`                      | Mute                   |
| `P`                      | Pause                  |
| `,` / `.`                | Time warp              |
| Mouse buttons            | Fire                   |
| `Ctrl+Z`                 | Undo destruction       |

Everything is remappable, and a gamepad works.

## Simulated, and stylised

Demiurge is explicit about the line, because a simulator that blurs it is not
one. In short:

**Simulated** — Keplerian orbits with secular rates, checked against JPL Horizons
on three dates and accurate to better than 0.02° of heliocentric longitude for
the inner planets; real radii, oblateness and GM; real rotation axes and
prime-meridian phase, so the terminator is correct for the displayed date;
inverse-square illumination, so Neptune really is about 900 times dimmer than
Earth; analytic eclipse geometry; ring shadows in both directions; a real
bright-star catalogue with apparent magnitudes and colour temperatures; local
surface gravity.

**Stylised** — scale is adjustable, and distant bodies are drawn as glare
impostors because at true scale they are sub-pixel; metre-scale terrain is always
invented even when real topography has been fetched; flora, fauna and points of
interest are fiction, though deterministic fiction; explosions make a sound in
vacuum, which they do not; planet destruction is a set piece, not physics.

The full accounting is in [`docs/astronomy.md`](docs/astronomy.md).

## One seed, one universe

Everything procedural comes from a single seed, which is a phrase rather than a
hex string because you should be able to say it out loud:

```
https://karellopez.github.io/Demiurge/#seed=cobalt%20meridian%20417
```

The same seed produces byte-identical terrain, points of interest, flora and
creatures on every machine and in every session. Random streams are forked by
name from the seed, never shared, so a terrain patch generates the same way
whether it was the first thing streamed or the thousandth. That is the difference
between a deterministic world and one that merely looks deterministic when you
load it the same way twice.

## Performance tiers

| Tier       | Reference hardware                     | Target                             |
| ---------- | -------------------------------------- | ---------------------------------- |
| **Potato** | Intel UHD 620, 4 cores, 8 GB, 1366×768 | 30 fps locked, no frame over 50 ms |
| **Low**    | Intel Iris Xe / Vega 8, 1080p          | 60 fps, p95 ≤ 18 ms                |
| **Medium** | GTX 1650 / M1, 1080p                   | 60 fps, p95 ≤ 14 ms                |
| **High**   | RTX 3060+, 1440p                       | 60 fps, p95 ≤ 12 ms                |

The tier is detected at boot and always overridable in settings without a
reload. Detection rounds every ambiguous signal downward, on the reasoning that
misjudging a fast card costs a little fidelity while misjudging a slow one costs
a slideshow before the player ever reaches the menu.

Targets are acceptance criteria measured by a committed benchmark, not
aspirations. See [`docs/performance.md`](docs/performance.md).

## Quality is a number

`npm run qa` measures nineteen gates, writes `docs/quality/report.md`, and exits
non-zero if any is red. Thresholds are floors that only move up; lowering one
requires an ADR with an issue link and an expiry date. Architecture boundaries
are machine-enforced, so `domain/` and `shared/` staying pure is a checked fact
rather than a claim.

Anything that could not be measured is reported as **skipped**, never as a pass.

See [`docs/quality.md`](docs/quality.md).

## Build phases

| #   | Phase                                                             | State    |
| --- | ----------------------------------------------------------------- | -------- |
| 0   | Repository and quality rig                                        | **done** |
| 1   | Foundation — engine loop, f64 math, floating origin, depth        | **done** |
| 2   | Solar system — data, Kepler propagation, orbit lines, time warp   | **done** |
| 3   | Cameras — rig, follow modes, transitions, scale presets           | **done** |
| 4   | Rendering — HDR, AgX, TAA, bloom, PBR, Sun, rings, eclipses       | next     |
| 5   | Atmospheres and clouds                                            |          |
| 6   | Terrain — cube-sphere quadtree, geomorphing, caves, collision     |          |
| 7   | Ship and descent — flight models, entry, landing, context handoff |          |
| 8   | Surface world — biomes, hazards, POIs, flora, fauna, journal      |          |
| 9   | Weapons and destruction                                           |          |
| 10  | Optimisation pass — all four tiers hit their targets              |          |
| 11  | Polish and release — audio, photo mode, tutorial, v1.0.0          |          |

## Documentation

- [Architecture](docs/architecture.md) — the five layers and the rules between them
- [Quality](docs/quality.md) — every gate, how it is measured, and the ratchet
- [Performance](docs/performance.md) — tiers, budgets, profiling, benchmark
- [Rendering](docs/rendering.md) — every technique, with paper links
- [Astronomy](docs/astronomy.md) — sources, accuracy, what is stylised
- [Gameplay](docs/gameplay.md) — the exploration loop and its systems
- [Coding standards](docs/contributing/coding-standards.md)
- [Decision records](docs/adr/) — every deviation from the brief, dated

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). In short: `npm run verify` must be green,
tests come with the behaviour, and if you touch a per-frame path you re-run the
benchmark and paste the numbers.

## Licence

MIT — see [LICENSE](LICENSE). Optional downloaded imagery keeps its own licence;
`CREDITS.md` is regenerated from the manifest so attribution cannot drift from
what was actually fetched. No imagery is committed to this repository.
