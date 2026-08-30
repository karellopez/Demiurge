# Architecture

Demiurge is five layers with dependencies pointing inward only. The rule is not
aspirational: every illegal edge below is a named `error` rule in
`.dependency-cruiser.cjs`, checked by `npm run qa` and failing CI on violation.

```
┌─ app/            bootstrapping, wiring, composition root, feature flags
│  ┌─ presentation/  render/ ui/ audio/ input/     (adapters: three.js, DOM, WebAudio)
│  │  ┌─ features/     space/ surface/ flight/ combat/ exploration/ diagnostics/
│  │  │  ┌─ domain/      orbits, bodies, ship dynamics, terrain rules, damage model
│  │  │  │  └─ shared/     f64 math, noise, rng, units, statistics, result types
```

An arrow may only point right-to-left in that diagram. `shared/` is the leaf.

## The layers

### `shared/`

Pure utilities with no idea what they are being used for. Imports **nothing** —
not three.js, not the DOM, not node builtins, not any npm package. Everything
here is synchronous, deterministic, and testable in Node with no environment.

| Module          | What it is                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `units.ts`      | Branded numeric units. `Meters` and `Kilometers` are both `number` at runtime and mutually unassignable at compile time. |
| `result.ts`     | `Result<T, E>` for expected failures. Exceptions are for programmer error only.                                          |
| `rng.ts`        | Deterministic `sfc32` generator with forkable named sub-streams.                                                         |
| `statistics.ts` | Frame-time percentiles. Averages hide stutter; the tail does not.                                                        |

### `domain/`

The rules of the universe, expressed as pure functions and data. May reach
inward to `shared/` and nowhere else.

| Module            | What it is                                                                 |
| ----------------- | -------------------------------------------------------------------------- |
| `quality-tier.ts` | The four hardware tiers and the budgets everything is measured against.    |
| `session-seed.ts` | Seed normalisation and generation. One seed determines the whole universe. |

### `features/`

Use cases. Each orchestrates domain logic and talks to the outside world only
through **ports** — interfaces the feature itself declares. A feature never
imports another feature; shared logic belongs in `domain/`, and cross-feature
messages go through the typed event bus.

The brief names five gameplay features — `space/`, `surface/`, `flight/`,
`combat/`, `exploration/`. A sixth, `diagnostics/`, holds the boot-time tier
selection: it is a genuine use case with a port and an adapter, and putting it
anywhere else would have meant either the renderer knowing the tier rules or the
domain knowing about GPUs.

### `presentation/`

Adapters. This is the only layer allowed to know that three.js, the DOM, WebAudio
and `navigator` exist. Swapping the renderer must not require touching
`features/` or `domain/` — and because the boundary is machine-checked, that
stays true rather than decaying into a claim in a README.

### `app/`

The composition root. The only place concrete classes are constructed and wired.
No service locator, no global singletons, no module-level mutable state, no DI
container — dependency injection here is a constructor argument and a plain
interface. Reading `composition-root.ts` tells you the whole shape of the running
program.

## Ports and adapters, concretely

The tier-detection flow is the smallest complete example of the pattern:

```
app/composition-root.ts
  ├─ calls  presentation/render/webgl-host-capabilities.ts   (adapter)
  │           reads WebGL2, navigator.deviceMemory, hardwareConcurrency
  │           returns  features/diagnostics/ports.ts#HostCapabilities
  │
  ├─ calls  features/diagnostics/detect-quality-tier.ts      (use case, pure)
  │           reads    features/diagnostics/gpu-markers.ts   (data)
  │           reads    domain/quality-tier.ts                (rules)
  │           returns  ports.ts#TierSelection
  │
  └─ calls  presentation/ui/boot-screen.ts                   (adapter)
              implements ports.ts#DiagnosticsSink
```

`detect-quality-tier.ts` never learns that WebGL exists, which is why its whole
decision table is covered by unit tests against a list of fake machines rather
than against whatever GPU happens to be in CI.

## The enforced rules

From `.dependency-cruiser.cjs`. All are `error`.

| Rule                                  | Forbids                                                     |
| ------------------------------------- | ----------------------------------------------------------- |
| `no-circular`                         | Any dependency cycle, at any depth.                         |
| `shared-is-a-leaf`                    | `shared/` importing any other layer.                        |
| `domain-imports-only-shared`          | `domain/` importing `features/`, `presentation/` or `app/`. |
| `features-do-not-reach-outward`       | `features/` importing `presentation/` or `app/`.            |
| `presentation-does-not-reach-app`     | Anything importing the composition root.                    |
| `features-never-import-each-other`    | A direct import between two different features.             |
| `domain-and-shared-are-platform-free` | Any npm or node-core import inside `domain/` or `shared/`.  |
| `no-orphans`                          | An unreachable module. Dead code, deleted rather than kept. |
| `not-to-dev-dep`                      | Shipped code importing a devDependency.                     |
| `src-does-not-import-tests`           | Production code depending on a fixture.                     |

ESLint backs the purity rules up from the other side: inside `domain/` and
`shared/`, the globals `window`, `document`, `performance` and `navigator` are
banned, as are `new Date()` and `Math.random()`. Time comes from an injected
`Clock` port; randomness comes from the seeded generator. Those two bans are what
make the determinism guarantee enforceable rather than hopeful.

## Regenerating the graph

```bash
npm run depcruise:graph | dot -T svg > docs/architecture.svg
```

Requires Graphviz. The graph is generated rather than drawn, so it cannot drift
from what the code actually does.

## Further reading

- `docs/adr/0002-layered-architecture-with-enforced-boundaries.md` — why this
  shape, and what it costs.
- `docs/quality.md` — the gates and how they are measured.
- `docs/contributing/coding-standards.md` — the rules inside a file.
