# Rendering

> **Status.** Phase 0 has established the repository, the quality rig and the
> boot path. The renderer itself lands across phases 1 and 4–6. This document is
> the design that work is being built against; every section is marked with the
> phase that makes it real, and each will gain its implementation notes and
> measurements as it lands.

The bar is a modern space simulator: HDR throughout, a linear workflow, physical
units. **Every feature here must degrade across all four tiers** — the fallback
is designed at the same time as the feature, never afterwards.

## Precision — before any rendering (phase 1, **done**)

Neptune sits ~4.5 × 10¹² m out; a surface rock is ~1 m. f32 carries about seven
digits. Naively, everything jitters and z-fights.

- Simulation positions are **f64** (JavaScript `number`), in metres,
  heliocentric, ICRF-aligned, J2000 epoch.
- **Floating origin**: each frame the camera's f64 position becomes the render
  origin. Render-space positions are `f32(bodyPosF64 − cameraPosF64)` — subtract
  in f64, cast afterwards. The camera sits at the origin. Never subtract in f32.
- Terrain patch vertices are generated relative to their own patch origin; the
  patch matrix carries the f64-derived translation. Planet-scale absolute
  coordinates are never baked into a vertex buffer.
- **Depth**: settled in phase 1 as a **logarithmic depth buffer**, not a
  two-frustum split. The split keeps early-Z but imposes a permanent ordering
  constraint on every later system — per-object frustum classification,
  transparency sorted within a pass and composited between passes, and a
  post-process graph reconciled across two depth ranges. See
  `docs/adr/0005-logarithmic-depth-buffer.md`, including the early-Z cost it
  concedes and the phase-10 revisit.
- Render scale is decoupled from simulation scale. At true scale a distant planet
  is sub-pixel, and is drawn as a physically motivated additive glare impostor at
  the correct apparent magnitude — which is what the eye actually sees.

## Pipeline (phase 4)

HDR `HalfFloat` targets, linear lighting, sRGB at the final write.

- **AgX tonemapping** with exposure control and histogram auto-exposure (~1 s up,
  ~2 s down), clamped so an explosion cannot black out the frame.
- **TAA** with a velocity buffer and neighbourhood clamping. Mandatory: starfields
  and rings alias brutally. SMAA is the low-tier fallback; a jitter-off debug
  toggle exists for diagnosing ghosting.

## Lighting (phase 4)

The Sun is the only primary light.

- Directional with an angular diameter (0.53° at Earth, varying with distance).
- **Physical inverse-square falloff**, so Neptune is ~900× dimmer and exposure
  adaptation makes that read correctly rather than flattening it.
- **PCSS soft shadows** plus a stabilised four-cascade CSM on surfaces.
- **Analytic eclipse and body shadows** — sphere-vs-sphere penumbra and umbra per
  pixel — so Io shadows Jupiter's clouds and lunar eclipses land on the correct
  dates. Verified against a real eclipse.
- **Ring shadows both ways**: rings onto the planet, planet onto the rings.
- **Planetshine**: cheap irradiance from the nearest large body, so Earthlight
  falls on the Moon's night side, over a very low-intensity Milky Way IBL.

## Post-processing (phase 4)

In order: velocity/TAA resolve → aerial perspective composite → energy-conserving
**mip-chain bloom** (no threshold hack) → occlusion-tested lens flare and
starburst → optional DOF (cinematic camera only) → per-object motion blur (off by
default) → exposure and tonemap → subtle grain, vignette and chromatic
aberration.

Aberration appears only on damage and entry heat, and is disabled entirely under
`prefers-reduced-motion`.

## Atmospheres (phase 5)

**Hillaire-style precomputed multiple scattering**: a transmittance LUT, a
multi-scatter LUT, a sky-view LUT, and a 3D aerial-perspective froxel volume.

One system serves both the orbital limb glow and the ground-level sky, with a
continuous transition and no mode switch — that continuity is the whole point.
Per-planet Rayleigh and Mie coefficients, scale heights, ozone and radii give Mars
a butterscotch sky with a blue sunset, Titan a thick orange haze, and Venus
opacity. Aerial perspective fogs distant terrain during descent. LUT resolutions
scale by tier.

- Sébastien Hillaire, _A Scalable and Production Ready Sky and Atmosphere
  Rendering Technique_ (EGSR 2020).
- Bruneton & Neyret, _Precomputed Atmospheric Scattering_ (EGSR 2008).

## Clouds (phase 5)

**Gas giants**: latitude-dependent zonal wind advection of a noise field with
curl turbulence and vortex injection — a Great Red Spot that actually rotates,
rather than scrolling UVs.

**Earth-like**: volumetric raymarched clouds — weather map, Worley/Perlin shape,
high-frequency erosion, Henyey–Greenstein phase, a powder term, temporal
reprojection, half-resolution. Visible from orbit and from below, and the camera
can fly through the layer. The low tier degrades to a shaded 2D layer with the
same silhouette.

- Schneider & Vos, _The Real-Time Volumetric Cloudscapes of Horizon Zero Dawn_
  (SIGGRAPH 2015).

## Surfaces (phase 4, extended in 6)

PBR with correct albedo and roughness; triplanar projection at the poles; normals
from height derivatives; **parallax occlusion mapping** near the camera;
stochastic/hex tiling to kill visible texture repeats.

Earth gets emissive night lights with a soft terminator blend, a specular ocean,
and snow by latitude and altitude. Ice bodies get wrap lighting and a
forward-scattering rim. Rings get radial opacity and colour from real ring
profiles, forward-scattering when backlit and backscattering when front-lit, with
a subtle density shimmer.

- Heitz & Neyret, _High-Performance By-Example Noise using a Histogram-Preserving
  Blending Operator_ (HPG 2018), for the stochastic tiling.

## The Sun and the sky (phase 4)

The Sun is an emissive sphere with animated granulation, **limb darkening**, a
chromosphere rim, a raymarched or layered corona, occasional prominences, and
screen-space glare that drives the bloom — beautiful without breaking the
tonemapper. Its follow camera handles the extreme luminance with auto-exposure
and a physical glare, never a white screen.

The sky is a real bright-star catalogue: RA/Dec, apparent magnitude mapped to
luminance, B−V mapped to colour temperature, rendered as GPU points with a
physical point-spread function, over a low-intensity Milky Way cubemap. Stars
occlude behind bodies and dim correctly through atmospheres.

## Degradation

| Feature                  | High              | Medium               | Low               | Potato                 |
| ------------------------ | ----------------- | -------------------- | ----------------- | ---------------------- |
| Anti-aliasing            | TAA               | TAA                  | TAA               | SMAA                   |
| Shadows                  | PCSS + 4 cascades | PCSS + 3 cascades    | hard + 2 cascades | hard + 1 cascade       |
| Atmosphere LUTs          | full              | full                 | reduced           | reduced, sky-view only |
| Clouds                   | volumetric        | volumetric, half-res | 2D layer          | 2D layer               |
| Volumetrics              | full-res          | half-res             | quarter-res       | off                    |
| Caves / 3D density field | yes               | yes                  | heightfield only  | heightfield only       |
| Parallax occlusion       | yes               | yes                  | normal mapping    | normal mapping         |

The adaptive quality controller steps a documented ladder — resolution scale →
volumetric quality → shadow resolution → cloud quality → instance density → LOD
bias → post-process passes — watching p95 over a two-second window, with
hysteresis so it cannot oscillate, an on-screen notice, and a manual override. It
never fights an explicit user setting.
