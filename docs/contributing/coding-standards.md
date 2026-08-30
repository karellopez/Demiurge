# Coding standards

The rules inside a file. `docs/architecture.md` covers the rules between files.

Most of this is machine-enforced; where it is, the enforcing rule is named. The
rest is the kind of thing a reviewer will raise, so it is written down rather
than left to be discovered.

## Names

Names say **what**, not how. `propagateOrbit`, not `doCalc`. `weakerTier`, not
`adjustTier2`.

Units live in the name or, better, in the type. `shared/units.ts` gives branded
types so that `Meters` and `Kilometers` are both `number` at runtime and refuse
to be mixed at compile time:

```ts
const radius = kilometers(6371);
const surface = someFunctionExpectingMeters(radius); // compile error
const surface = someFunctionExpectingMeters(kilometersToMeters(radius)); // fine
```

Unit confusion is the single largest bug class in a project spanning fourteen
orders of magnitude. Use the branded type even when it feels like ceremony.

Booleans read as assertions: `isWithinFrameBudget`, `hasAnyMarker`,
`supportsWebGL2`. Enforced by `unicorn/consistent-boolean-name`.

## Size and shape

| Limit                 | Value                          | Enforced by                    |
| --------------------- | ------------------------------ | ------------------------------ |
| Function length       | 50 lines                       | `max-lines-per-function`       |
| Parameters            | 4, then take an options object | `max-params`                   |
| Nesting depth         | 4                              | `max-depth`                    |
| Cyclomatic complexity | 10                             | `complexity`                   |
| Cognitive complexity  | 15                             | `sonarjs/cognitive-complexity` |
| File length           | 400 lines                      | `max-lines`                    |
| Class length          | 200 lines                      | `npm run qa`                   |

A file that outgrows its limit is a design signal. Split it by responsibility,
never by line count — a `foo-part-2.ts` is worse than the file it came from.

No boolean trap parameters. `setQuality(QualityTier.Low)`, never
`setQuality(true)`.

## Errors

Two kinds, handled differently:

- **Expected failures** — an asset 404, a shader that will not compile, a worker
  that times out — are values. They return `Result<T, E>` from `shared/result.ts`
  so the compiler will not let a caller forget them. This is what keeps the
  renderer's fallback paths honest.
- **Programmer errors** are exceptions, and should crash loudly in development.

Never swallow an error. `catch {}` fails lint. Every `catch` either handles the
error, wraps it with context and rethrows, or returns it as an `Err`:

```ts
} catch (cause) {
  console.warn('WebGL2 probe could not create a context; assuming unavailable.', cause);
  return undefined;
}
```

## Immutability

`readonly` on interface members, `as const` on tables. Mutation is allowed **only**
in documented hot paths, and must carry a comment saying so:

```ts
// PERF: mutable for zero-alloc — this runs 600 times a second per patch.
```

## The frame loop allocates nothing

In any code that runs per frame or per simulation step:

- no object or array literals, no `map` / `filter` / spread, no string
  concatenation, no `new Vector3()`, no closures created per frame;
- pre-allocated scratch objects, explicit `acquire` / `release` pools, and
  structure-of-arrays typed-array storage;
- reuse worker transferables; transfer `ArrayBuffer`s rather than copying.

This is verified, not trusted: `tests/bench/allocation.test.ts` runs the hot
paths and asserts heap growth of effectively zero per frame. GC pauses are the
main cause of stutter in a WebGL game, and a stutter is exactly what the Potato
tier cannot absorb.

## Determinism

The universe is a pure function of one seed. Two rules follow, both lint-enforced
inside `domain/` and `shared/`:

- `Math.random()` is banned. Draw from `shared/rng.ts`.
- `new Date()` and `performance.now()` are banned. Time arrives through an
  injected `Clock` port.

When a subsystem needs its own random stream, fork one by name:

```ts
const rng = forkRng(seed, `mars/patch/${String(face)}/${String(index)}`);
```

A forked stream depends only on `(seed, label)`, never on how far the parent has
been drawn, so patches can be generated in any order — or skipped and generated
later — and still produce the same world. That property is the difference between
a deterministic world and one that merely looks deterministic when you load it
the same way twice.

## Comments

Comments explain **why**. The code already says what.

- Every shader file header names the technique and links the paper.
- Every magic number is a named constant with a source, or it is deleted.
- Public API of `domain/`, `shared/` and every port gets TSDoc with units,
  ranges and preconditions. Coverage of this is measured (≥ 90%).
- A deferred-work marker without an issue link fails lint. So does a bare
  `eslint-disable`; write `-- reason, and a link` after the rule name.

## Abstraction

Rule of three: duplicate twice, abstract on the third. Premature abstraction
costs more than the duplication it prevents.

The exception is physics and noise, which are single-source by mandate. There is
one noise implementation, and the CPU and GPU consumers are generated from it —
if they drift, the player sinks into the ground.

## Tests

Tests are production code and are held to the same standards.

- One behaviour per test. No logic in tests — no loops that hide which case
  failed, no conditionals.
- Descriptive names in the form
  `it('rejects a landing when vertical speed exceeds the gear limit')`.
- Builders and fixtures over inline literals. `aHost({ deviceMemoryGiB: 4 })`
  says what the test is about; a twelve-field object literal does not.
- Do not mock what you own. `domain/` and `shared/` need no mocks at all, which
  is most of the reason they are shaped the way they are.
- Property-based tests (`fast-check`) for invariants: noise parity, the Kepler
  solver across eccentricities, "no crack between neighbouring terrain patches at
  any depth difference of 1".

## Commits

Conventional Commits, squash-merged, trunk-based development with short-lived
`feat/*`, `fix/*`, `perf/*` and `refactor/*` branches.

No commit contains commented-out code, a stray `console.log`, a deferred-work
marker without an issue link, or a mixed refactor-and-feature payload. A refactor
and the feature it enables are two commits.
