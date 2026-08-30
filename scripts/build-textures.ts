/**
 * `npm run build:textures` — compresses fetched imagery to KTX2 / Basis.
 *
 * Uncompressed textures are never shipped to the GPU on the lower tiers: a
 * 8192x4096 RGBA PNG is 128 MiB of VRAM on its own, which is the entire Potato
 * budget for one body. KTX2 with Basis Universal transcodes on the GPU to
 * whatever the device actually supports — ETC1S for Potato and Low, UASTC for
 * High — at roughly an eighth of that.
 *
 * The encoder itself (`toktx` / `basisu` from the KTX-Software toolkit) is a
 * native binary and deliberately *not* an npm dependency: it is large, it is
 * platform-specific, and it is only ever needed by whoever is preparing assets,
 * never by someone cloning the repository to play or to contribute code. This
 * script therefore checks for it and explains how to get it rather than assuming
 * it is present.
 *
 * @module
 */

import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { run } from './qa/shell';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_ROOT = path.join(REPOSITORY_ROOT, 'public', 'assets');

/** Encoder settings per tier family. */
interface EncodingProfile {
  /** Suffix added before `.ktx2`, so both encodings can coexist. */
  readonly suffix: string;
  /** Arguments passed to `toktx`. */
  readonly args: readonly string[];
}

/**
 * The two encodings shipped.
 *
 * ETC1S is roughly 4x smaller and decodes everywhere, including the integrated
 * parts that are the Potato and Low reference machines. UASTC keeps far more
 * detail in normal maps and is used from Medium upward, where the VRAM budget
 * can absorb it.
 */
const PROFILES: readonly EncodingProfile[] = [
  {
    suffix: '.etc1s',
    args: ['--t2', '--encode', 'etc1s', '--clevel', '4', '--qlevel', '192', '--genmipmap'],
  },
  {
    suffix: '.uastc',
    args: ['--t2', '--encode', 'uastc', '--uastc_quality', '2', '--zcmp', '18', '--genmipmap'],
  },
];

/** Extensions worth compressing. */
const SOURCE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg']);

/**
 * Reports whether the KTX toolkit is installed.
 *
 * @returns True when `toktx` can be executed.
 */
function hasEncoder(): boolean {
  return run('toktx', ['--version']).succeeded;
}

/**
 * Lists every compressible image under a directory.
 *
 * @param directory - Absolute path to walk.
 * @returns Absolute paths of every source image found.
 */
async function listSourceImages(directory: string): Promise<string[]> {
  const found: string[] = [];

  const walk = async (current: string): Promise<void> => {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute);
      } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        found.push(absolute);
      }
    }
  };

  await walk(directory);
  return found;
}

/**
 * Compresses one image under both profiles.
 *
 * @param sourcePath - Absolute path to the source image.
 * @returns How many encodings succeeded.
 */
function compress(sourcePath: string): number {
  const withoutExtension = sourcePath.slice(0, -path.extname(sourcePath).length);
  let written = 0;

  for (const profile of PROFILES) {
    const target = `${withoutExtension}${profile.suffix}.ktx2`;
    const result = run('toktx', [...profile.args, target, sourcePath]);
    if (result.succeeded) {
      written += 1;
    } else {
      console.warn(`  fail  ${path.basename(target)}: ${result.stderr.trim()}`);
    }
  }

  return written;
}

/**
 * Compresses everything that has been fetched.
 */
async function main(): Promise<void> {
  if (!existsSync(SOURCE_ROOT)) {
    console.info('\nNothing to compress: public/assets/ does not exist.');
    console.info(
      'Run `npm run assets:fetch` first, or just play - the procedural path needs no assets.\n',
    );
    return;
  }

  if (!hasEncoder()) {
    console.error('\n`toktx` was not found on PATH.');
    console.error(
      'Install the KTX-Software toolkit from https://github.com/KhronosGroup/KTX-Software/releases',
    );
    console.error('and re-run. Nothing was written.\n');
    process.exitCode = 1;
    return;
  }

  const images = await listSourceImages(SOURCE_ROOT);
  console.info(`\nCompressing ${String(images.length)} image(s) to KTX2.\n`);

  let written = 0;
  for (const image of images) {
    written += compress(image);
    console.info(`  ok    ${path.relative(SOURCE_ROOT, image)}`);
  }

  console.info(`\n${String(written)} KTX2 file(s) written.\n`);
}

await main();
