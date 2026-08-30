/**
 * `npm run validate:data` — checks `data/bodies.json` against its schema.
 *
 * The catalogue is hand-maintained and cites its sources, which makes it exactly
 * the kind of file where a transposed digit or a missing field slips through. A
 * mistyped radius would not crash anything; it would quietly produce a planet
 * the wrong size, which is far worse. So the file is validated as part of
 * `npm run verify`, before it can reach a build.
 *
 * Beyond the schema, a few invariants need more than JSON Schema can express and
 * are checked here: parents must exist, the tree must have exactly one root and
 * no cycles, and no body may be more oblate than a sphere.
 *
 * @module
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ajv2020 } from 'ajv/dist/2020.js';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIRECTORY = path.join(REPOSITORY_ROOT, 'data');

/** The shape this script reasons about beyond the schema. */
interface CatalogEntry {
  readonly id: string;
  readonly name: string;
  readonly parent: string | null;
  readonly equatorialRadiusKm: number;
  readonly polarRadiusKm: number;
  readonly rings?: { readonly innerRadiusKm: number; readonly outerRadiusKm: number };
  readonly orbit: { readonly source?: string } | null;
}

/**
 * Checks one body in isolation.
 *
 * @param body - The entry to check.
 * @param sourceKeys - The citation keys declared at the top of the file.
 * @returns Problems with this body, empty when it is sound.
 */
function checkBody(body: CatalogEntry, sourceKeys: ReadonlySet<string>): string[] {
  const problems: string[] = [];

  if (body.polarRadiusKm > body.equatorialRadiusKm) {
    problems.push(`${body.id}: polar radius exceeds equatorial radius`);
  }
  if (body.rings !== undefined) {
    if (body.rings.innerRadiusKm >= body.rings.outerRadiusKm) {
      problems.push(`${body.id}: ring inner radius is not inside the outer radius`);
    }
    if (body.rings.innerRadiusKm <= body.equatorialRadiusKm) {
      problems.push(`${body.id}: rings start inside the body`);
    }
  }
  if (body.orbit?.source !== undefined && !sourceKeys.has(body.orbit.source)) {
    problems.push(`${body.id}: orbit cites "${body.orbit.source}", which is not a declared source`);
  }

  return problems;
}

/**
 * Checks that the bodies form one tree with no cycles and no dangling parents.
 *
 * @param bodies - The catalogue entries.
 * @returns Problems with the tree, empty when it is sound.
 */
function checkTree(bodies: readonly CatalogEntry[]): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();

  for (const body of bodies) {
    if (ids.has(body.id)) {
      problems.push(`duplicate id "${body.id}"`);
    }
    ids.add(body.id);
  }

  for (const body of bodies) {
    if (body.parent !== null && !ids.has(body.parent)) {
      problems.push(`${body.id}: parent "${body.parent}" is not in the catalogue`);
    }
  }

  const roots = bodies.filter((body) => body.parent === null);
  if (roots.length !== 1) {
    problems.push(`the catalogue must have exactly one root; it has ${String(roots.length)}`);
  }

  return [...problems, ...findCycles(bodies)];
}

/**
 * Finds bodies whose parent chain never reaches the root.
 *
 * @param bodies - The catalogue entries.
 * @returns One problem per body caught in a cycle.
 */
function findCycles(bodies: readonly CatalogEntry[]): string[] {
  const parentOf = new Map(bodies.map((body) => [body.id, body.parent]));
  const problems: string[] = [];

  for (const body of bodies) {
    let steps = 0;
    let current = body.parent;
    while (current !== null && steps <= bodies.length) {
      current = parentOf.get(current) ?? null;
      steps += 1;
    }
    if (steps > bodies.length) {
      problems.push(`${body.id}: parent chain does not reach the root, so there is a cycle`);
    }
  }

  return problems;
}

/**
 * Checks the invariants JSON Schema cannot express.
 *
 * @param bodies - The catalogue entries.
 * @param sourceKeys - The citation keys declared at the top of the file.
 * @returns A list of problems, empty when the catalogue is sound.
 */
function checkInvariants(
  bodies: readonly CatalogEntry[],
  sourceKeys: ReadonlySet<string>,
): string[] {
  return [...bodies.flatMap((body) => checkBody(body, sourceKeys)), ...checkTree(bodies)];
}

/**
 * Validates the catalogue and sets the exit code.
 */
function main(): void {
  const schema = JSON.parse(
    readFileSync(path.join(DATA_DIRECTORY, 'bodies.schema.json'), 'utf8'),
  ) as Record<string, unknown>;
  const document = JSON.parse(readFileSync(path.join(DATA_DIRECTORY, 'bodies.json'), 'utf8')) as {
    readonly sources: Readonly<Record<string, string>>;
    readonly bodies: readonly CatalogEntry[];
  };

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);

  if (!validate(document)) {
    console.error('\ndata/bodies.json does not match its schema:\n');
    const schemaErrors = validate.errors ?? [];
    for (const error of schemaErrors) {
      console.error(`  ${error.instancePath || '/'} ${error.message ?? 'is invalid'}`);
    }
    console.error('');
    process.exitCode = 1;
    return;
  }

  const problems = checkInvariants(document.bodies, new Set(Object.keys(document.sources)));
  if (problems.length > 0) {
    console.error('\ndata/bodies.json is schema-valid but breaks a catalogue invariant:\n');
    for (const problem of problems) {
      console.error(`  ${problem}`);
    }
    console.error('');
    process.exitCode = 1;
    return;
  }

  console.info(`data/bodies.json is valid: ${String(document.bodies.length)} bodies.`);
}

main();
