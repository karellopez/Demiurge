# 1. Record architecture decisions

- Status: accepted
- Date: 2026-08-30

## Context

Demiurge is built against a fixed written brief that specifies its architecture,
its quality gates and its performance targets in some detail. Over eleven build
phases there will be places where the brief cannot be followed exactly — a named
tool turns out to be abandoned, two requirements turn out to be in tension, a
measurement turns out to mean something different from what was assumed. Those
moments are the interesting ones, and they are precisely the ones that get lost
if the reasoning lives only in a commit message or in someone's memory.

## Decision

Every deviation from the brief, and every architectural choice that a reasonable
reviewer might have made differently, is recorded here as a numbered
Architecture Decision Record in the style described by Michael Nygard.

An ADR is short. It states what was true when the decision was made, what was
decided, and what that costs. It is not updated when the decision changes;
instead a new ADR supersedes it, so the history stays readable as history.

Records are numbered sequentially and never renumbered. A record's status is one
of `proposed`, `accepted`, `superseded by NNNN`, or `deprecated`.

## Consequences

- The brief remains the specification; this directory is the list of places
  where reality argued with it and won.
- Reviewers can ask "why is this like this?" and get an answer that is dated and
  attributable rather than reconstructed.
- Lowering any quality threshold requires an ADR by rule, which makes the cost
  of doing so visible rather than incidental.

## References

- Michael Nygard, _Documenting Architecture Decisions_ (2011).
