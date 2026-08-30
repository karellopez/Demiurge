/**
 * Running the external quality tools and capturing what they say.
 *
 * Every collector in the QA report shells out to a tool that already exists;
 * this module is the single place that knows how to do that without letting a
 * non-zero exit code kill the whole run. A failing tool is a *result* to report,
 * not an exception — the point of `npm run qa` is to print every gate's status
 * in one pass, so an early `throw` would hide the other nine.
 *
 * @module
 */

import { spawnSync } from 'node:child_process';

/** What a tool did when it ran. */
export interface CommandResult {
  /** The exit code, or null when the process was killed by a signal. */
  readonly exitCode: number | null;
  /** Everything the tool wrote to stdout. */
  readonly stdout: string;
  /** Everything the tool wrote to stderr. */
  readonly stderr: string;
  /** True when the tool exited 0. */
  readonly succeeded: boolean;
  /** Set when the tool could not be started at all. */
  readonly startupError: string | undefined;
}

/** How to run a command. */
export interface RunOptions {
  /** Working directory. Defaults to the current one. */
  readonly cwd?: string;
  /** Milliseconds before the tool is killed. Defaults to five minutes. */
  readonly timeoutMs?: number;
}

/** Five minutes: long enough for a cold `tsc` on CI, short enough to fail visibly. */
const DEFAULT_TIMEOUT_MS = 300_000;

/** Output cap per stream, so a runaway tool cannot exhaust memory. */
const MAX_BUFFER_BYTES = 32 * 1024 * 1024;

/**
 * Runs a command to completion and captures its output.
 *
 * @param command - The executable to run.
 * @param args - Arguments to pass to it.
 * @param options - Working directory and timeout.
 * @returns What the command printed and how it exited.
 */
export function run(
  command: string,
  args: readonly string[],
  options: RunOptions = {},
): CommandResult {
  const result = spawnSync(command, [...args], {
    cwd: options.cwd ?? process.cwd(),
    encoding: 'utf8',
    timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxBuffer: MAX_BUFFER_BYTES,
    shell: process.platform === 'win32',
  });

  return {
    exitCode: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    succeeded: result.status === 0,
    startupError: result.error?.message,
  };
}

/**
 * Runs an npm-installed CLI through the local `node_modules/.bin`.
 *
 * @param binary - The tool's bin name, such as `depcruise`.
 * @param args - Arguments to pass to it.
 * @param options - Working directory and timeout.
 * @returns What the tool printed and how it exited.
 */
export function runTool(
  binary: string,
  args: readonly string[],
  options: RunOptions = {},
): CommandResult {
  return run('npx', ['--no-install', binary, ...args], options);
}

/**
 * Parses JSON a tool printed, tolerating leading progress output.
 *
 * Several of these tools interleave a spinner or a banner with their JSON, so
 * the parse starts at the first brace or bracket rather than at position zero.
 *
 * @param text - The tool's stdout.
 * @returns The parsed value, or `undefined` when nothing parseable was found.
 */
export function parseJsonOutput(text: string): unknown {
  const firstBrace = text.indexOf('{');
  const firstBracket = text.indexOf('[');
  const candidates = [firstBrace, firstBracket].filter((index) => index >= 0);
  if (candidates.length === 0) {
    return undefined;
  }

  const start = Math.min(...candidates);
  try {
    return JSON.parse(text.slice(start)) as unknown;
  } catch {
    return undefined;
  }
}
