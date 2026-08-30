# Gameplay

> **Status.** The ship arrives in phase 7, the surface sandbox in phase 8,
> weapons in phase 9. This is the design those phases are built against.

Demiurge has two registers, and they are the same simulation rather than two
apps. The default is an accurate, quiet solar-system simulator. Pressing `F`
enters fun mode, where there is a ship, and the ship has a laser, and the laser
can unmake a planet.

## The loop

**Look → go → land → walk → find → record → leave.**

1. Pick a body. Every one, the Sun included, is selectable by click, by search,
   by `[` and `]`, and from a quick bar, with a live stats card.
2. Fly to it. Throttle, afterburner, and a warp drive that ramps to about
   0.5 AU/s and refuses to engage inside a gravity well or an atmosphere.
3. Land. Orbit to entry to approach to touchdown in one continuous shot, with no
   loading screen and no cut.
4. Get out and walk. The whole planet is walkable, streamed, with no invisible
   walls and no instanced pocket levels.
5. Find something: a derelict, a monolith, a geyser field, a cave system.
6. Scan it, name it, and have that recorded. Exploration that is not recorded
   does not feel like it mattered.
7. Leave, or stay.

## Descent

The transition is the centrepiece, and it is a real engine handoff rather than a
camera trick. `ContextDirector` runs `SPACE → APPROACH → ENTRY → LANDING →
SURFACE` and back:

- **Prewarm at about 150 km.** `SurfaceContext` allocates from its pools, starts
  streaming terrain around the predicted touchdown point, generates the local
  points of interest, and compiles surface shader variants — all off the main
  thread, budgeted, while the descent continues.
- **Cross-fade.** Both contexts are briefly live. Space-only systems are
  suspended below 20 km; surface-only systems activate progressively.
- **The handoff completes before touchdown.** If a tier cannot finish in time,
  the entry plasma whiteout legitimately masks the remaining stream-in. That is
  an artistic cover, not a spinner. There is never a loading bar.

Touchdown is valid at vertical speed under 8 m/s, lateral under 5 m/s, tilt under
20 degrees, and ground slope under 25 degrees. Outside that: damage, or a crash.

## The surface

Whole-planet, streamed, deterministic from the seed. Travel escalates: on foot,
then jetpack, then rover, then ship.

- **Biomes with consequences.** Assigned from latitude, altitude, slope and a
  climate noise field. Each carries a material set, foliage table, creature
  table, weather profile, ambient audio bed, and a hazard profile covering
  temperature, toxicity, radiation and pressure. Hazards drain suit protection,
  which forces the player to shelter in caves, return to the ship, or resupply.
  That is what makes exploration have stakes rather than being a walking
  simulator.
- **Points of interest** placed by a spatial hash over the sphere, so they are
  discoverable but never uniform. Crashed derelicts, monoliths, mineral spires,
  geyser fields, canyon networks, enterable craters, ice caves, lava tubes,
  abandoned outposts with readable logs. Each has a rarity, a biome affinity, a
  silhouette that reads from a distance, and a reason to walk over there.
- **Flora** from an L-system with per-planet parameters, GPU-instanced with
  impostor LODs, wind-animated in the vertex shader.
- **Fauna** from a modular skeleton with per-planet body plans, procedurally
  animated with IK footfall on uneven ground, driven by a small behaviour state
  machine: graze, flee, curious approach, territorial, flocking. They react to
  the player, to the ship landing, and to weapons fire.
- **Weather and sky** driven by the real simulated rotation and Sun position.
  Dust storms cut visibility and raise hazard; aurorae appear at night on
  magnetised bodies.
- **Scanning and discovery** is the progression spine: identify flora, fauna,
  minerals and points of interest; a persistent journal per planet with
  player-chosen names, timestamps and coordinates; a completion percentage.
- **Mining** carves the density field, persisted as sparse per-patch deltas.
- **Navigation**: waypoint beacons, a ship marker with distance and altitude, a
  compass, and a planetary map generated from the heightfield. Getting lost
  should be possible; getting home should always be.
- **Persistence** to IndexedDB, keyed by seed and body, exportable as JSON so a
  world can be shared.

## Cameras

One rig, five ways of holding it. Every body including the Sun is followable, at
any scale, and the camera never clips a surface and never cuts.

`C` cycles the modes. Each one holds a different thing still, and that is the
whole difference between them:

| Mode             | What it holds still                                                       |
| ---------------- | ------------------------------------------------------------------------- |
| **Orbit**        | The body, centred. Drag to swing around it, wheel to zoom.                |
| **Locked frame** | A point on the surface, so the terrain stops sliding and the stars wheel. |
| **Inertial**     | The stars, so you can see how fast the body actually spins.               |
| **Sun-relative** | The terminator, held off the star line, so relief throws shadows.         |
| **Cinematic**    | Nothing — a slow dolly for looking rather than working.                   |

Sun-relative is withheld when the Sun itself is followed: a star has no
terminator, and the direction to the Sun is undefined at its centre. The cycle
skips it rather than offering a mode that quietly does nothing.

Distance is measured in **body radii**, not metres, because that is the only unit
under which one number means the same thing at Phobos and at Jupiter. Thirty
radii frames a body whether it is eleven kilometres across or seventy thousand.
Zoom is exponential and clamped at 1.05 radii, just above the surface, so no zoom
at any scale can put the camera inside a planet.

Selecting a body starts a timed transition rather than a cut: 0.8 s for a nearby
move, 2 s across the system, log-scaled in radii between them, eased with a
smoothstep that does not overshoot. Selecting again mid-transition re-aims from
wherever the camera actually is, so clicking through six bodies in two seconds is
a continuous path rather than six teleports.

### Finding a body

Every body is reachable four ways: the quick bar (the Sun and the eight planets,
one click each), the searchable list, `[` and `]` to step through that list in
order, and a click on any row. The list is indented by what orbits what, and a
search keeps the parents of a match, so a moon is never shown orphaned under
nothing.

The card under the list is live: distance from the camera and from the Sun,
radius, mass, surface gravity against Earth's, rotation period and orbital
period. Retrograde rotation is spelled out in words rather than left as a minus
sign nobody reads. Local solar time joins the card in phase 4, with the IAU
rotation model that gives a body a defined prime meridian.

## Scale

Real sizes and real distances are the default, and they are almost entirely
empty space: if Earth were a pixel, Neptune would be off the end of a tennis
court. Two independent exaggerations make that legible without lying about which
is which — `distanceScale` compresses the gaps (1 down to 0.001) and `sizeScale`
inflates the bodies (1 up to 1000).

`1`, `2` and `3` select the presets: **True scale**, **Orrery** (the whole system
in one view, bodies still recognisable) and **Textbook** (the diagram from a
classroom wall). Each animates over 1.5 s, geometrically rather than linearly,
because the difference between 0.01 and 0.02 is enormous and the difference
between 0.9 and 0.91 is nothing.

Scale is a **rendering** transform and never a simulation one. Positions,
orbits, gravity and collision are always computed in true metres; the exaggeration
is applied once, at the floating-origin boundary, on the way to the GPU. That is
what makes "changing scale must never break orbits, cameras, landing or
collision" true by construction rather than by vigilance.

## Flight

Two profiles. **Arcade** is the default: velocity follows input, inertial
damping, auto-levelling near surfaces. **Newtonian** is a true 6DOF rigid body
with RCS translation, preserved angular momentum, patched-conic gravity, and a
live osculating-orbit readout with prograde, retrograde and normal markers over a
projected trajectory ellipse.

## Destruction

Absurd by design, fenced inside fun mode, spectacular in execution. Damage
accumulates against a per-body integrity scaled by mass: Phobos takes one shot,
Jupiter is a project.

The sequence runs six to ten seconds — fracture, breach, detonation, aftermath —
and the camera should want to watch it. The moons of a destroyed planet lose
their primary and fly off along their velocity vectors, which is both correct and
the best physics joke in the project.

`Ctrl+Z` restores the last destroyed body. "Reset system" restores everything.
Neither ever requires a page reload.

On lower tiers the sequence keeps its full staging and timing and drops
volumetric resolution and chunk counts. It must never feel like a different,
cheaper event.

## Controls

All remappable, with gamepad support.

| Key                      | Action                 |
| ------------------------ | ---------------------- |
| `WASD`, `Space` / `Ctrl` | Translate              |
| Mouse                    | Look                   |
| `Q` / `E`                | Roll                   |
| `Shift`                  | Boost                  |
| `X`                      | Warp                   |
| `F`                      | Fun mode               |
| `C`                      | Cycle camera           |
| `T`                      | Target                 |
| `[` / `]`                | Cycle bodies           |
| `B`                      | Body browser           |
| `1` / `2` / `3`          | Scale presets          |
| `L`                      | Landing assist         |
| `G`                      | Gear                   |
| `E`                      | Exit or board the ship |
| `V`                      | Scanner                |
| `J`                      | Journal                |
| `Tab`                    | Parameters             |
| `H`                      | Hide HUD               |
| `M`                      | Mute                   |
| `P`                      | Pause                  |
| `,` / `.`                | Time warp              |
| Mouse buttons            | Fire                   |
| `Ctrl+Z`                 | Undo destruction       |

## Accessibility

Not a phase-11 afterthought; a floor the whole project sits on.

Full keybind remapping, gamepad support, an FOV slider, camera-shake and flash
scaling, `prefers-reduced-motion` honoured, a colourblind-safe HUD palette,
subtitles for audio cues, and no reliance on colour alone to convey state.

Under reduced motion the destruction sequence drops its shake, flare, aberration
and grain spike in favour of a fast, gentle fade. The event still reads; it just
stops assaulting the viewer.
