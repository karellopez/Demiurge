/**
 * `npm run fixtures:horizons` — refreshes the accuracy fixtures from JPL.
 *
 * The propagator's accuracy claim is only worth anything if it is checked
 * against an authority, so `tests/fixtures/horizons/*.json` holds real
 * heliocentric state vectors fetched from JPL Horizons. They are committed, so
 * the test suite is offline and deterministic; this script exists to regenerate
 * them, not to run in CI.
 *
 * Frame: heliocentric (`CENTER='500@10'`, the Sun's centre), referred to the
 * mean ecliptic and equinox of J2000 (`REF_PLANE='ECLIPTIC'`), in kilometres.
 * That is exactly the frame `propagateOrbit` produces, which is what makes the
 * comparison a measurement rather than an approximation.
 *
 * @module
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE_DIRECTORY = path.join(REPOSITORY_ROOT, 'tests', 'fixtures', 'horizons');

/**
 * The dates the accuracy claim is checked on.
 *
 * One at the epoch itself, one well before it and one well after, so that a
 * mistake in the *rates* cannot hide behind a correct epoch value. All three sit
 * inside the 1800–2050 window Standish's table is fitted to.
 */
const SAMPLE_DATES = ['1900-01-01', '2000-01-01', '2050-01-01'] as const;

/** Horizons body identifiers, keyed by the id used in `data/bodies.json`. */
const HORIZONS_IDS: Readonly<Record<string, string>> = {
  mercury: '199',
  venus: '299',
  earth: '399',
  mars: '499',
  jupiter: '599',
  saturn: '699',
  uranus: '799',
  neptune: '899',
  pluto: '999',
};

/** One body's state at one instant, as Horizons reported it. */
interface HorizonsState {
  /** Body id, matching `data/bodies.json`. */
  readonly body: string;
  /** Calendar date, `YYYY-MM-DD`, at 00:00 TDB. */
  readonly date: string;
  /** Julian date (TDB) Horizons actually used. */
  readonly julianDate: number;
  /** Heliocentric ecliptic position, in kilometres. */
  readonly positionKm: readonly [number, number, number];
  /** Heliocentric ecliptic velocity, in kilometres per second. */
  readonly velocityKmPerSecond: readonly [number, number, number];
}

/**
 * Builds the Horizons API URL for one body and date.
 *
 * @param horizonsId - The Horizons body identifier.
 * @param date - Calendar date, `YYYY-MM-DD`.
 * @returns The request URL.
 */
function buildUrl(horizonsId: string, date: string): string {
  const parameters = new URLSearchParams({
    format: 'text',
    COMMAND: `'${horizonsId}'`,
    OBJ_DATA: "'NO'",
    MAKE_EPHEM: "'YES'",
    EPHEM_TYPE: "'VECTORS'",
    CENTER: "'500@10'",
    REF_PLANE: "'ECLIPTIC'",
    VEC_TABLE: "'2'",
    OUT_UNITS: "'KM-S'",
    START_TIME: `'${date} 00:00'`,
    STOP_TIME: `'${date} 01:00'`,
    STEP_SIZE: "'1h'",
  });
  return `https://ssd.jpl.nasa.gov/api/horizons.api?${parameters.toString()}`;
}

/**
 * Extracts the first state vector from a Horizons text response.
 *
 * @param body - The body id, for the error message.
 * @param date - The date, for the error message.
 * @param text - The raw response.
 * @returns The parsed state.
 */
function parseState(body: string, date: string, text: string): HorizonsState {
  const start = text.indexOf('$$SOE');
  const end = text.indexOf('$$EOE');
  if (start === -1 || end === -1) {
    throw new Error(
      `Horizons returned no ephemeris for ${body} at ${date}:\n${text.slice(0, 400)}`,
    );
  }

  const block = text.slice(start + 5, end);
  const julian = /^ *([\d.]+) *=/mu.exec(block);
  if (julian === null) {
    throw new Error(`Could not find the epoch in the Horizons block for ${body} at ${date}`);
  }

  // One anchored read per component. A single pattern spanning all three
  // backtracks badly on a malformed block, and this is clearer besides.
  const component = (name: string): number => {
    const match = new RegExp(String.raw`\b${name}\s*=\s*(\S+)`, 'u').exec(block);
    if (match === null) {
      throw new Error(`Could not read ${name} for ${body} at ${date}`);
    }
    return Number(match[1]);
  };

  return {
    body,
    date,
    julianDate: Number(julian[1]),
    positionKm: [component('X'), component('Y'), component('Z')],
    velocityKmPerSecond: [component('VX'), component('VY'), component('VZ')],
  };
}

/**
 * Fetches every body at every sample date.
 */
async function main(): Promise<void> {
  await mkdir(FIXTURE_DIRECTORY, { recursive: true });
  const states: HorizonsState[] = [];

  for (const [body, horizonsId] of Object.entries(HORIZONS_IDS)) {
    for (const date of SAMPLE_DATES) {
      // Sequential on purpose: this is a public science service and there is no
      // reason to open eighteen connections to it.
      const response = await fetch(buildUrl(horizonsId, date));
      if (!response.ok) {
        throw new Error(`Horizons responded ${String(response.status)} for ${body} at ${date}`);
      }
      states.push(parseState(body, date, await response.text()));
      console.info(`  ok    ${body.padEnd(9)} ${date}`);
    }
  }

  const document = {
    $comment:
      'Generated by `npm run fixtures:horizons` from JPL Horizons. Heliocentric, ' +
      'mean ecliptic and equinox of J2000, kilometres and km/s. Regenerate rather ' +
      'than edit. JPL Horizons data is in the public domain.',
    source: 'https://ssd.jpl.nasa.gov/horizons/',
    fetchedAt: new Date().toISOString().slice(0, 10),
    states,
  };

  const target = path.join(FIXTURE_DIRECTORY, 'planet-states.json');
  await writeFile(target, `${JSON.stringify(document, undefined, 2)}\n`, 'utf8');
  console.info(
    `\n${String(states.length)} states written to tests/fixtures/horizons/planet-states.json\n`,
  );
}

await main();
