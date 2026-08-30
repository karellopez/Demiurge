/**
 * How far the orbital element fit can be trusted.
 *
 * The planetary elements are Standish's 1800–2050 fit. Outside that span the
 * positions degrade smoothly rather than failing — nothing throws, nothing
 * jumps — which is exactly what makes it dangerous: the simulation goes on
 * looking authoritative long after it has stopped being accurate.
 *
 * That is not a hypothetical. At the top of the time-warp ladder one second of
 * play is a year, so a player holding `.` leaves the fitted window in about
 * twenty seconds. The project's rule is that it never lies about what it knows,
 * so the readout says when the date has left the window rather than quietly
 * presenting a fit that no longer carries its accuracy claim.
 *
 * Extending the fit — Standish also publishes a 3000 BC – 3000 AD table with
 * extra correction terms for Jupiter through Pluto — is deliberately not done
 * here. Every accuracy claim in this project is measured against real JPL
 * Horizons vectors, the committed fixtures span 1900–2050, and adding a wider
 * table without fixtures to check it against would be an accuracy claim nobody
 * had verified. See `docs/astronomy.md`.
 *
 * @module
 */

import { toCalendarDate } from '@domain/time/julian';
import type { Seconds } from '@shared/units';

/** First year the planetary element fit covers. */
export const FIT_FIRST_YEAR = 1800;

/** Last year the planetary element fit covers. */
export const FIT_LAST_YEAR = 2050;

/**
 * Reports whether a moment is inside the fitted window.
 *
 * The bounds are calendar years because that is how Standish states them —
 * "1800 AD – 2050 AD" — so the whole of 2050 is inside, not the first instant
 * of it.
 *
 * @param simTimeSeconds - Seconds since J2000.0.
 * @returns True when the accuracy claim in `docs/astronomy.md` still applies.
 */
export function isWithinFittedWindow(simTimeSeconds: Seconds): boolean {
  const { year } = toCalendarDate(simTimeSeconds);
  return year >= FIT_FIRST_YEAR && year <= FIT_LAST_YEAR;
}
