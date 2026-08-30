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
