# 2. Layered architecture with machine-enforced boundaries

- Status: accepted
- Date: 2026-08-30

## Context

A simulator of this shape has a strong tendency to collapse into one large
mutually-dependent blob: the terrain generator reaches for the camera to decide
what to build, the UI reaches into the physics to read a number, and within a
few months nothing can be tested without standing up a WebGL context.

The specific risks here are worse than usual:

- The renderer is three.js today. A WebGPU path is planned behind a flag, and
  the WebGL2 path has to stay intact while that is built.
- The orbital mechanics and the terrain rules have to run identically in a
  worker, in a Node unit test, and in the browser. Anything that touches
  `window`, `performance` or `Date` cannot do that.
- Determinism is a product requirement: the same seed must produce the same
  world everywhere. Hidden global state and ambient clocks are the two things
  most likely to break it, and both are invisible until they do.

## Decision

Five layers, with dependencies pointing inward only:

```
app  ->  presentation  ->  features  ->  domain  ->  shared
```

- `shared/` and `domain/` import nothing outside themselves — no three.js, no
  DOM, no node builtins, no npm packages at all. They are pure, synchronous and
  deterministic, and are unit-testable in Node with no environment.
- `features/` orchestrate domain logic and reach the outside world only through
  ports they declare. `presentation/` supplies the adapters.
- `app/` is the composition root and the only place concrete classes are
  constructed. No service locator, no global singletons, no module-level mutable
  state.
- Features never import each other. Cross-feature communication goes through a
  typed event bus with a documented catalogue.

This is enforced by `dependency-cruiser` rather than by convention: each illegal
edge is a named rule in `.dependency-cruiser.cjs`, all at `error` severity, run
as part of `npm run qa` and failing CI on violation. Two ESLint overrides back it
up inside the pure layers, banning `window`, `document`, `performance`,
`navigator`, `new Date()` and `Math.random()` outright.

## Consequences

- Swapping the renderer cannot touch `features/` or `domain/`. The boundary is
  checked, so this claim stays true rather than decaying.
- `domain/` and `shared/` carry the highest coverage floors in the project (95%
  lines, 90% branches) because they are the layers where that is cheap.
- Time and randomness are injected, never ambient. This is mildly inconvenient
  at every call site and is the reason the determinism requirement is meetable
  at all.
- A genuinely shared concept between two features has to be pushed down into
  `domain/` rather than imported sideways. That friction is deliberate.

## References

- `docs/architecture.md` for the module map and the generated graph.
- Robert C. Martin, _Clean Architecture_ (2017), for the dependency rule.
- Alistair Cockburn, _Hexagonal Architecture_ (2005), for ports and adapters.
