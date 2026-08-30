/**
 * The shape of a quality gate, and the helpers for building one.
 *
 * A gate is one row of the table in `docs/quality.md`: a measured number, the
 * floor or ceiling it is held to, and whether it cleared. Keeping the shape
 * uniform is what lets the report render as Markdown, as JSON, and as a PR
 * comment from a single pass.
 *
 * @module
 */

/** Whether a measurement cleared its threshold. */
export type GateStatus = 'pass' | 'fail' | 'skipped';

/** Which way a threshold points. */
type GateDirection = 'min' | 'max';

/** One measured quality gate. */
export interface Gate {
  /** Stable machine-readable id, used as the JSON key and the ratchet key. */
  readonly id: string;
  /** Human-readable metric name, matching docs/quality.md. */
  readonly name: string;
  /** The tool that produced the measurement. */
  readonly tool: string;
  /** The measurement, formatted for a person. */
  readonly value: string;
  /** The threshold, formatted for a person. */
  readonly threshold: string;
  /** Whether it cleared. */
  readonly status: GateStatus;
  /** Extra context: the failing files, the tool's complaint, why it was skipped. */
  readonly detail: string | undefined;
  /**
   * The numbers behind the strings, when the gate is numeric. Present only for
   * gates the ratchet can tighten.
   */
  readonly numeric:
    | { readonly measured: number; readonly threshold: number; readonly direction: GateDirection }
    | undefined;
}

/** Everything a gate builder needs. */
export interface NumericGateInput {
  readonly id: string;
  readonly name: string;
  readonly tool: string;
  readonly measured: number;
  readonly threshold: number;
  readonly direction: GateDirection;
  readonly unit?: string;
  readonly detail?: string | undefined;
  readonly decimals?: number;
}

/**
 * Builds a gate from a number and the floor or ceiling it must respect.
 *
 * @param input - The measurement, its threshold, and how to present them.
 * @returns The gate, with its status already decided.
 */
export function numericGate(input: NumericGateInput): Gate {
  const decimals = input.decimals ?? 2;
  const unit = input.unit ?? '';
  const isPassed =
    input.direction === 'min'
      ? input.measured >= input.threshold
      : input.measured <= input.threshold;

  return {
    id: input.id,
    name: input.name,
    tool: input.tool,
    value: `${input.measured.toFixed(decimals)}${unit}`,
    threshold: `${input.direction === 'min' ? '>=' : '<='} ${input.threshold.toFixed(decimals)}${unit}`,
    status: isPassed ? 'pass' : 'fail',
    detail: input.detail,
    numeric: {
      measured: input.measured,
      threshold: input.threshold,
      direction: input.direction,
    },
  };
}

/**
 * Builds a gate that is simply pass or fail, with no number behind it.
 *
 * @param id - Stable machine-readable id.
 * @param name - Human-readable metric name.
 * @param tool - The tool that produced the verdict.
 * @param outcome - Whether it passed, and anything worth printing.
 * @param outcome.passed
 * @param outcome.detail
 * @param outcome.threshold
 * @returns The gate.
 */
export function booleanGate(
  id: string,
  name: string,
  tool: string,
  outcome: { passed: boolean; detail?: string | undefined; threshold?: string },
): Gate {
  return {
    id,
    name,
    tool,
    value: outcome.passed ? 'clean' : 'violations',
    threshold: outcome.threshold ?? 'zero',
    status: outcome.passed ? 'pass' : 'fail',
    detail: outcome.detail,
    numeric: undefined,
  };
}

/**
 * Builds a gate that could not be measured in this run.
 *
 * Skipping is loud rather than silent: a skipped gate is printed in the report
 * with its reason, so "we never ran mutation testing" cannot masquerade as a
 * pass.
 *
 * @param id - Stable machine-readable id.
 * @param name - Human-readable metric name.
 * @param tool - The tool that would have produced the measurement.
 * @param reason - Why it did not run.
 * @returns The gate.
 */
export function skippedGate(id: string, name: string, tool: string, reason: string): Gate {
  return {
    id,
    name,
    tool,
    value: 'not measured',
    threshold: '-',
    status: 'skipped',
    detail: reason,
    numeric: undefined,
  };
}

/**
 * Trims tool output down to something worth printing in a report.
 *
 * @param text - The tool's stdout or stderr.
 * @param maxLines - How many lines to keep.
 * @returns The first few non-empty lines, joined.
 */
export function summarise(text: string, maxLines = 6): string {
  const lines = text
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== '');
  const kept = lines.slice(0, maxLines).join('\n');
  return lines.length > maxLines
    ? `${kept}\n... (${String(lines.length - maxLines)} more lines)`
    : kept;
}
