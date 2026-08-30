# 5. Logarithmic depth buffer, not a two-frustum split

- Status: accepted
- Date: 2026-08-30

## Context

Demiurge draws a one-metre rock and Saturn's rings in the same frame. The camera
frustum has to span from about 0.01 m to about 1e13 m — fifteen orders of
magnitude — and a conventional depth buffer cannot do it.

The reason is the perspective divide. A standard projection stores `1/z`, so
almost the entire depth range is spent on the first few metres and the far half
of the scene collapses into a handful of distinguishable values. Two surfaces a
thousand kilometres apart near Neptune end up with identical depth, and which one
draws in front becomes a function of triangle submission order. The result is
z-fighting that flickers as the camera moves.

The brief offers two remedies and requires that one be chosen and proved.

**Two-frustum split.** Render 0.01 m – 10 km, clear depth, then render
10 km – 1e13 m. Each pass gets a full depth buffer over a range it can resolve.
It keeps hardware early-Z and costs nothing per fragment.

**Logarithmic depth.** Write `log(z)` to `gl_FragDepth`, which distributes
precision evenly across the range in one pass.

## Decision

Logarithmic depth, via three.js's `logarithmicDepthBuffer: true`.

The deciding factor is what each does to the rest of the project rather than
what each does to depth. The two-frustum split imposes an ordering constraint on
every future system: every object must be classified into a frustum each frame,
anything spanning the boundary must be drawn twice or clipped, transparency has
to be sorted within a pass and then composited between passes, and the
post-process graph — which by phase 4 owns velocity buffers, TAA resolve and
aerial perspective — needs its passes reconciled across two depth ranges. That
is a large, permanent complexity budget spent in phase 1 to solve a problem one
flag also solves.

The logarithmic buffer costs one flag, works with three.js's built-in materials
and with custom shaders, and needs no per-object classification. `gl_FragDepth`
is core in WebGL2, so there is no extension to feature-detect.

## Consequences

- **Early-Z is disabled** wherever the fragment shader writes depth. On a
  fill-rate-bound integrated GPU — which is exactly the Potato and Low reference
  hardware — that is a real cost, and it is the reason this decision is revisited
  rather than settled. The depth prepass planned for terrain in phase 6 recovers
  part of it.
- Custom shaders must include three.js's `logdepthbuf` chunks. A shader that
  forgets them writes linear depth into a logarithmic buffer and sorts wrongly
  against everything else, which looks like a material bug rather than a depth
  bug. Every custom material gets a note in its header.
- Depth precision is roughly uniform in log space, so the near plane can be
  0.01 m without starving the far field.

## Verification

`tests/unit/domain/floating-origin.test.ts` proves the precision half: a point at
4.5e12 m round-trips to within a millimetre, and a camera creeping forward a
centimetre per frame moves a distant point smoothly rather than in 500 km snaps.

The depth half is proved by the phase-1 scene itself — a one-metre cube at 1 au
and another at 4.5e12 m, both stable, in one frame — and is captured as a visual
regression baseline.

## Revisit

Phase 10, the optimisation pass, with the Potato tier profiled. If depth writes
show up as a fill-rate cost on Intel UHD 620, the two-frustum split becomes worth
its complexity and this ADR is superseded.
