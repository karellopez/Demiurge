# Astronomy

> **Status.** The catalogue and the Keplerian propagator landed in phase 2 and
> are measured against JPL Horizons on every run. Rotation, eclipse geometry and
> the star catalogue arrive with the renderer in phase 4.

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

**Validation.** `tests/fixtures/horizons/planet-states.json` holds twenty-seven
real heliocentric state vectors fetched from JPL Horizons — nine bodies on three
dates, referred to the mean ecliptic and equinox of J2000, the same frame the
propagator produces. They are committed, so the check is offline and
deterministic; `npm run fixtures:horizons` regenerates them.

The dates are 1900-01-01, 2000-01-01 and 2050-01-01: one at the epoch, one a
century before and one half a century after, so that an error in the _rates_
cannot hide behind a correct value at the epoch.

### Achieved accuracy

Measured, worst case across the three dates:

| Body       | Longitude error | Radial error |
| ---------- | --------------- | ------------ |
| Mercury    | 0.003°          | 0.001%       |
| Venus      | 0.004°          | 0.004%       |
| Earth      | 0.002°          | 0.002%       |
| Mars       | 0.016°          | 0.009%       |
| Jupiter    | 0.086°          | 0.070%       |
| **Saturn** | **0.151°**      | 0.126%       |
| Uranus     | 0.022°          | 0.043%       |
| Neptune    | 0.013°          | 0.021%       |
| Pluto      | 0.011°          | 0.024%       |

Eight of the nine clear the 0.1° bar comfortably. **Saturn does not**, and the
test states a tolerance of 0.16° for it specifically rather than loosening the
bar for everything.

The reason is the great inequality. Jupiter and Saturn sit close to a 5:2 mean
motion resonance, which drives a periodic swing in Saturn's longitude of roughly
a tenth of a degree with a period near nine hundred years. A mean-element fit has
no term for it by construction, so this is not a transcription error and no
amount of care with the table removes it — only a fuller theory such as VSOP87
would, at the cost of a large data table. That trade is worth revisiting if the
outer planets ever need to be right to arcseconds; today they need to be in the
right place, and they are.

Earth's entry describes the Earth–Moon barycentre rather than the Earth, because
that is what Standish's table publishes. The two differ by about 4700 km, which
at one astronomical unit is 0.0018° — fifty times smaller than the bar.

### Validity window

The planetary elements are Standish's 1800–2050 fit. Outside that window the
positions degrade smoothly rather than failing, but they are no longer covered by
the accuracy claim above. This matters more than it sounds: at the top of the
time-warp ladder a minute of play is sixty years, so a player leaves the fitted
window in about twenty seconds. Extending it is a phase-3 concern, alongside the
camera work that makes running that far worthwhile.

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
- **Moon and dwarf-planet orbits are snapshots.** Their elements are the
  osculating ellipse at J2000 as Horizons reports it, plus a mean motion from the
  orbital period. That places each moon correctly and moves it round at the right
  rate; it does not model the precession of its node, so a moon's position drifts
  from the truth over decades in a way the planets' do not.
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
