# Astronomy

> **Status.** The body catalogue and the propagator land in phase 2. This
> document states what will be simulated, what will be stylised, and where the
> numbers come from — the honesty contract the implementation is held to.

## Sources

`data/bodies.json` is the single source of truth, validated against a JSON Schema
at build time. Every entry cites where its numbers came from:

- **JPL Horizons** — state vectors and osculating elements at J2000, and the
  fixtures the propagator is tested against.
- **IAU WGCCRE** — rotation axes, rates and prime-meridian constants. The
  _Report of the IAU Working Group on Cartographic Coordinates and Rotational
  Elements_ is the reference for W₀ and Ẇ.
- **NASA planetary fact sheets** — radii, GM, albedo, atmospheric composition.
- **USGS Astrogeology** — global topography and imagery, public domain.

Nothing downloaded is committed. See `CREDITS.md`, which is regenerated from the
manifest by `npm run assets:fetch` so attribution cannot drift from what was
actually fetched.

## Bodies

The Sun; Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune; Pluto,
Ceres, Eris; the Moon; Phobos and Deimos; Io, Europa, Ganymede and Callisto;
Titan, Enceladus, Mimas and Iapetus; Triton; Charon. The Saturnian and Uranian
ring systems.

Per body: id, name, parent, equatorial and polar radius, GM, rotation period,
obliquity and node, prime meridian W₀ and Ẇ, albedo, atmosphere parameters, ring
geometry, a planet profile driving terrain and biomes, texture URLs with
licences, and J2000 Keplerian elements with per-century rates.

Oblateness is real and must be visible on Jupiter and Saturn. Those are not
spheres, and drawing them as spheres is the first thing an astronomer notices.

## Propagation

Keplerian by default. Newton–Raphson on the eccentric anomaly, switching to
Halley's method above e = 0.9 where Newton converges poorly, tolerance
1 × 10⁻¹², with an iteration cap and a documented fallback. Secular rates are
applied, so the elements drift correctly over centuries.

An N-body mode using a symplectic integrator sits behind a toggle, labelled in
the UI as divergent over long timescales — because it is, and a simulation that
quietly disagrees with the ephemeris is worse than one that says so.

**Validation.** Positions on three known dates match committed JPL Horizons
fixtures within 0.1° of heliocentric longitude. If that proves unreachable, the
achieved accuracy is documented here rather than the test being quietly loosened.

## Rotation and time

Rotation uses real axes, rates and prime-meridian phase, so the terminator on
Earth is correct for the displayed UTC date, and sunrise on Mars is the sunrise
the simulation says it is at that timestamp.

Time is explicit: `simTimeSeconds` is an f64 count of seconds since J2000.
Nothing else in the project reads a clock — a `Clock` port is injected, which is
what makes the whole simulation reproducible.

## Simulated

- Keplerian orbits with secular element rates.
- Real radii, oblateness, masses and GM.
- Real rotation axes, periods and prime-meridian phase.
- Physical inverse-square illumination from the Sun.
- Analytic eclipse geometry: umbra and penumbra, sphere against sphere.
- Ring shadowing, in both directions.
- Apparent magnitudes from a bright-star catalogue, with B−V mapped to colour
  temperature.
- Local surface gravity, so a jump on the Moon feels like a jump on the Moon.

## Stylised

Stated plainly, because a simulator that blurs this line is not a simulator.

- **Scale is adjustable.** True scale is the default, but the orrery and textbook
  presets exaggerate size and compress distance so the system is comprehensible.
- **Distant bodies are impostors.** At true scale Neptune is sub-pixel. It is
  drawn as an additive glare impostor at the correct apparent magnitude, which is
  what the eye sees but is not geometry.
- **Terrain is procedural** unless real topography has been fetched, and even
  then real heightmaps supply only the low-frequency base; metre-scale detail is
  always invented. It is plausible, not surveyed.
- **Flora, fauna and points of interest are entirely invented.** Deterministic
  from the seed, but fiction.
- **Sound in vacuum.** There is none, really. Demiurge plays a deliberately
  stylised delayed cue anyway, because the alternative is a silent explosion.
- **Planet destruction** is not physics. It is a set piece.
- **Atmospheric chemistry** is not modelled; scattering coefficients are fitted
  to look right, not derived.

## Non-goals

No relativistic physics. No accurate atmospheric chemistry. No simulated
ecosystems beyond behaviour state machines.
