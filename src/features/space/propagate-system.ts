/**
 * Placing every body in the system at a moment in time.
 *
 * Two things make this more than a loop over `propagateOrbit`.
 *
 * The first is that orbits are relative. Io's elements describe an ellipse about
 * Jupiter, not about the Sun, so Io's heliocentric position is its own orbit
 * plus Jupiter's. The catalogue is a tree and positions accumulate down it, so
 * parents must be solved before their children — which is why the bodies are
 * sorted by depth once, at construction, rather than resolved per frame.
 *
 * The second is that this runs every frame for every body, so it allocates
 * nothing. Positions live in one `Float64Array` of three components per body,
 * written in place; callers read through {@link readPosition} into a scratch
 * vector they own.
 *
 * @module
 */

import type { Body, BodyCatalog } from '@domain/body';
import { propagateOrbit } from '@domain/orbits/propagate';
import { toJulianCenturies } from '@domain/time/julian';
import { createVec3, set, type Vec3 } from '@shared/math/vec3';
import type { Seconds } from '@shared/units';

/** Heliocentric positions for a whole catalogue, at one instant. */
export interface SystemState {
  /**
   * Writes every body's heliocentric position for the given moment.
   *
   * @param simTimeSeconds - Seconds since J2000.0.
   */
  update(simTimeSeconds: Seconds): void;

  /**
   * Reads one body's heliocentric position.
   *
   * @param bodyId - The body's identifier.
   * @param out - The vector to write into, in metres.
   * @returns `out`, or the origin when the body is not in the catalogue.
   */
  readPosition(bodyId: string, out: Vec3): Vec3;

  /** The bodies, ordered so that a parent always precedes its children. */
  readonly ordered: readonly Body[];
}

/**
 * Orders bodies so that every parent precedes its children.
 *
 * @param catalog - The catalogue to order.
 * @returns The bodies, root first.
 */
function orderByDepth(catalog: BodyCatalog): readonly Body[] {
  const ordered: Body[] = [];
  const visit = (body: Body): void => {
    ordered.push(body);
    for (const child of catalog.childrenOf(body.id)) {
      visit(child);
    }
  };
  visit(catalog.root);
  return ordered;
}

/**
 * Creates the propagator for a catalogue.
 *
 * @param catalog - The bodies to place.
 * @returns A system state, not yet updated.
 */
export function createSystemState(catalog: BodyCatalog): SystemState {
  const ordered = orderByDepth(catalog);
  const indexById = new Map(ordered.map((body, index) => [body.id, index]));

  // PERF: mutable for zero-alloc — three components per body, written in place
  // every frame. A Vec3 per body per frame would be sixty allocations a second
  // for each of twenty-two bodies.
  const positions = new Float64Array(ordered.length * 3);
  const scratch = createVec3();

  /**
   * Resolves one body into the position buffer.
   *
   * The parent's position is already resolved, because the ordering guarantees
   * the parent came first; a moon's heliocentric position is its own orbit about
   * its planet plus the planet's about the Sun.
   *
   * @param index - The body's slot in the buffer.
   * @param body - The body to place.
   * @param centuries - Julian centuries since J2000.
   */
  const writeBodyPosition = (index: number, body: Body, centuries: number): void => {
    const base = index * 3;

    if (body.orbit === undefined) {
      positions[base] = 0;
      positions[base + 1] = 0;
      positions[base + 2] = 0;
      return;
    }

    propagateOrbit(scratch, body.orbit, centuries);

    const parentIndex = body.parentId === undefined ? undefined : indexById.get(body.parentId);
    const parentBase = parentIndex === undefined ? -1 : parentIndex * 3;
    const hasParent = parentBase >= 0;

    positions[base] = scratch.x + (hasParent ? (positions[parentBase] ?? 0) : 0);
    positions[base + 1] = scratch.y + (hasParent ? (positions[parentBase + 1] ?? 0) : 0);
    positions[base + 2] = scratch.z + (hasParent ? (positions[parentBase + 2] ?? 0) : 0);
  };

  return {
    ordered,

    update(simTimeSeconds: Seconds): void {
      const centuries = toJulianCenturies(simTimeSeconds);
      for (const [index, body] of ordered.entries()) {
        writeBodyPosition(index, body, centuries);
      }
    },

    readPosition(bodyId: string, out: Vec3): Vec3 {
      const index = indexById.get(bodyId);
      if (index === undefined) {
        return set(out, 0, 0, 0);
      }
      const base = index * 3;
      return set(out, positions[base] ?? 0, positions[base + 1] ?? 0, positions[base + 2] ?? 0);
    },
  };
}
