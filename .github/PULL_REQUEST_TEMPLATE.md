## What this changes

<!-- One paragraph. What is different for a player, or for someone reading the code? -->

## Why

<!-- The problem, not the solution. Link the issue if there is one. -->

Closes #

## How it was verified

<!-- Not "it works" - what did you actually run and see? -->

- [ ] `npm run verify` is green locally
- [ ] New behaviour is covered by tests that fail without the change
- [ ] Manually exercised in the browser (say which tier and which scene)

## Checklist

- [ ] **Tests** — behaviour is covered, and `domain/` or `shared/` changes keep those layers at their higher coverage floor
- [ ] **Quality gates** — no threshold was lowered; if one was, an ADR says why, with an issue link and an expiry date
- [ ] **Architecture** — no new dependency crosses a layer inward-only boundary; features still do not import each other
- [ ] **Performance** — if this touches a per-frame path: benchmark re-run, no allocations added, degradation path exists for every tier down to Potato
- [ ] **Accessibility** — new UI is keyboard reachable, readable against both a black starfield and a bright Sun, and does not rely on colour alone
- [ ] **Docs** — `docs/` updated, `CHANGELOG.md` updated for any user-visible change
- [ ] **ADR** — added if this made an architectural choice a reviewer might have made differently
- [ ] **Hygiene** — no commented-out code, no `console.log`, no deferred-work marker without an issue link, no mixed refactor-and-feature payload

## Performance impact

<!-- Delete if this cannot touch the frame loop. Otherwise paste the before/after
     from `npm run bench:flythrough`, and say which tier you measured on. -->

## Screenshots

<!-- For anything visual. Before and after, same seed, same camera. -->
