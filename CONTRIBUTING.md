# Contributing

Thanks for looking. This is a project with strong opinions and machine-enforced
ones, which is good news for a contributor: almost everything you need to know,
a tool will tell you.

## Getting set up

```bash
git clone https://github.com/karellopez/Demiurge.git
cd Demiurge
npm ci
npm run dev
```

Node 22 LTS or newer. The exact version is in `.nvmrc`, and `engines` will refuse
anything older rather than letting you discover the problem five commands later.

```bash
npm run verify        # everything CI runs
npm run test:watch    # while working
npm run qa -- --quick # the gates, minus the slow ones
```

## Before you open a pull request

`npm run verify` must be green. It runs typecheck, lint, tests with coverage, the
build, and the quality gates, in that order — the same sequence CI runs, so a
green local run means a green CI run.

If it fails, the failure names the rule and usually the fix. Two that surprise
people:

- **`dependency-cruiser` violations** mean you crossed a layer boundary. The
  rule name says which one. The fix is almost never to relax the rule; see
  [`docs/architecture.md`](docs/architecture.md).
- **`knip` failures** mean something is exported and unused, or a dependency is
  installed and unused. Delete it. A dependency the project does not yet use gets
  added in the phase that uses it, not before.

## What a good change looks like

**Tests come with the behaviour.** Written first or alongside, never after. A
test that passes before your change is not testing your change.

Tests are production code: one behaviour each, no logic inside them, builders
rather than twelve-field object literals, and names that read as sentences —
`it('rejects a landing when vertical speed exceeds the gear limit')`. Do not mock
what you own; `domain/` and `shared/` need no mocks at all, which is most of the
reason they are shaped the way they are.

**One thing per commit.** A refactor and the feature it enables are two commits.
Conventional Commits, squash-merged:

```
feat(terrain): geomorph between LOD levels to remove popping
fix(camera): stop the chase camera clipping through Saturn's rings
perf(streaming): halve patch upload cost with a shared staging buffer
refactor(diagnostics): split GPU marker tables out of the tier policy
```

**No deferred-work markers without an issue link.** Lint enforces this. A bare
one fails the build rather than ageing quietly in the source.

## If you touch a per-frame path

The frame loop allocates nothing. Not "very little" — nothing. GC pauses are the
main cause of stutter in a WebGL game, and a stutter is exactly what the Potato
tier cannot absorb.

That means no object or array literals, no `map` / `filter` / spread, no string
concatenation, no `new Vector3()`, and no closures created per frame. Use
pre-allocated scratch objects, explicit `acquire` / `release` pools, and
structure-of-arrays typed-array storage.

This is verified rather than trusted — `tests/bench/allocation.test.ts` will tell
you if you got it wrong. Re-run `npm run bench:flythrough` and paste the
before-and-after numbers into the pull request, saying which tier you measured
on. An optimisation without a measurement is a guess.

## If you add a rendering feature

Design the degradation path at the same time as the feature, not afterwards. A
feature that cannot degrade onto Intel UHD 620 does not ship, and retrofitting a
fallback is much harder than designing one.

The tier table in [`docs/rendering.md`](docs/rendering.md) shows the shape this
usually takes.

## If you change something architectural

Add an ADR to [`docs/adr/`](docs/adr/). It is short: what was true, what you
decided, what it costs. The number is the next one in sequence, and records are
never renumbered.

You need one for any deviation from the project brief, and for any decision a
reasonable reviewer might have made differently.

## If you want to lower a quality threshold

You need an ADR with an issue link and an expiry date. Thresholds are floors that
only move up; that is the entire point of the ratchet. There is currently exactly
one such ADR, and it explains itself at some length.

Going the other way is easy: after a green run, `npm run qa -- --ratchet`
proposes tightened values. Commit `scripts/qa/thresholds.json` along with the
work that earned it.

## Determinism

The universe is a pure function of one seed, and two rules keep it that way. Both
are lint-enforced inside `domain/` and `shared/`:

- `Math.random()` is banned. Draw from `shared/rng.ts`.
- `new Date()` and `performance.now()` are banned. Time arrives through an
  injected `Clock` port.

When a subsystem needs its own stream, fork one by name:

```ts
const rng = forkRng(seed, `mars/patch/${String(face)}/${String(index)}`);
```

A forked stream depends only on `(seed, label)` and never on how far the parent
has been drawn, so patches generate identically whether they were streamed first
or last.

## Reporting a bug

Include the **seed**. It is on the title screen and in the URL, and because the
world is deterministic it usually turns a vague report into an exact one. The
issue template asks for it, along with the `[demiurge]` line the console prints
at start-up, which carries the detected tier and the GPU string.

## Code of conduct

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
