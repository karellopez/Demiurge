/**
 * Source metrics computed from the TypeScript AST.
 *
 * Three of the required quality gates have no off-the-shelf tool that
 * understands modern TypeScript: the maintainability index, TSDoc coverage on
 * the public API, and the class-length limit. The usual recommendation for the
 * first of those, `typhonjs-escomplex`, has not shipped a release since 2022 and
 * parses JavaScript rather than TypeScript, which the project's own dependency
 * policy rules out. Since `typescript` is already a dependency, the three are
 * computed here directly from the compiler's AST instead.
 *
 * @see docs/adr/0003-node-and-toolchain-versions.md
 * @module
 */

import { readFileSync } from 'node:fs';

import * as ts from 'typescript';

/** Per-file metrics. */
export interface FileMetrics {
  /** Repository-relative path, with forward slashes. */
  readonly path: string;
  /** Logical lines of code: executable statements and declarations, not physical lines. */
  readonly logicalLinesOfCode: number;
  /** Total physical lines, as the `max-lines` lint rule counts them. */
  readonly physicalLines: number;
  /** Sum of cyclomatic complexity across the file's functions, at least 1. */
  readonly cyclomaticComplexity: number;
  /** Halstead volume, in bits. */
  readonly halsteadVolume: number;
  /** Maintainability index on the 0-171 Coleman-Oman scale. Higher is better. */
  readonly maintainabilityIndex: number;
  /** The longest class body in the file, in physical lines. */
  readonly longestClassLines: number;
  /** Exported declarations that a TSDoc comment must cover. */
  readonly documentableExports: number;
  /** How many of those actually carry a TSDoc comment. */
  readonly documentedExports: number;
}

/** Node kinds that introduce a branch, for cyclomatic complexity. */
const BRANCHING_KINDS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement,
  ts.SyntaxKind.CaseClause,
  ts.SyntaxKind.CatchClause,
  ts.SyntaxKind.ConditionalExpression,
]);

/** Binary operators that introduce a branch. */
const BRANCHING_OPERATORS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
]);

/** Declaration kinds whose exported form must carry TSDoc. */
const DOCUMENTABLE_KINDS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.ClassDeclaration,
  ts.SyntaxKind.InterfaceDeclaration,
  ts.SyntaxKind.TypeAliasDeclaration,
  ts.SyntaxKind.EnumDeclaration,
  ts.SyntaxKind.VariableStatement,
]);

/**
 * Counts branch points to give a file's total cyclomatic complexity.
 *
 * @param source - The parsed source file.
 * @returns One plus the number of branch points.
 */
function measureCyclomaticComplexity(source: ts.SourceFile): number {
  let complexity = 1;

  const visit = (node: ts.Node): void => {
    const isBranchPoint =
      BRANCHING_KINDS.has(node.kind) ||
      (ts.isBinaryExpression(node) && BRANCHING_OPERATORS.has(node.operatorToken.kind));
    if (isBranchPoint) {
      complexity += 1;
    }
    ts.forEachChild(node, visit);
  };

  ts.forEachChild(source, visit);
  return complexity;
}

/**
 * Computes Halstead volume from the token stream.
 *
 * Operands are identifiers and literals; operators are everything else that is
 * a punctuation or keyword token. This is the standard approximation, and what
 * matters for the gate is that it is applied consistently across files.
 *
 * @param source - The parsed source file.
 * @returns The Halstead volume in bits, or 0 for an empty file.
 */
function measureHalsteadVolume(source: ts.SourceFile): number {
  const operators = new Map<string, number>();
  const operands = new Map<string, number>();

  const record = (bucket: Map<string, number>, key: string): void => {
    bucket.set(key, (bucket.get(key) ?? 0) + 1);
  };

  const visit = (node: ts.Node): void => {
    if (node.getChildCount(source) === 0) {
      const text = node.getText(source);
      if (text !== '') {
        const isOperand =
          ts.isIdentifier(node) ||
          ts.isPrivateIdentifier(node) ||
          ts.isLiteralExpression(node) ||
          node.kind === ts.SyntaxKind.TrueKeyword ||
          node.kind === ts.SyntaxKind.FalseKeyword ||
          node.kind === ts.SyntaxKind.NullKeyword;
        record(isOperand ? operands : operators, text);
      }
    }
    ts.forEachChild(node, visit);
  };

  ts.forEachChild(source, visit);

  const distinct = operators.size + operands.size;
  if (distinct === 0) {
    return 0;
  }
  let total = 0;
  for (const count of operators.values()) {
    total += count;
  }
  for (const count of operands.values()) {
    total += count;
  }
  return total * Math.log2(distinct);
}

/**
 * Counts logical lines of code: statements and declarations.
 *
 * A `Block` is not counted, because `{ ... }` is punctuation rather than a step
 * the reader has to follow; its contents are counted individually. Class members
 * and object properties count, since each is a thing to understand.
 *
 * @param source - The parsed source file.
 * @returns The number of logical lines.
 */
function countLogicalLines(source: ts.SourceFile): number {
  let count = 0;

  const visit = (node: ts.Node): void => {
    const isLogicalLine =
      (ts.isStatement(node) && !ts.isBlock(node)) ||
      ts.isPropertyDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isPropertySignature(node) ||
      ts.isMethodSignature(node) ||
      ts.isPropertyAssignment(node) ||
      ts.isEnumMember(node);
    if (isLogicalLine) {
      count += 1;
    }
    ts.forEachChild(node, visit);
  };

  ts.forEachChild(source, visit);
  return count;
}

/**
 * Finds the longest class body in the file, measured in physical lines.
 *
 * @param source - The parsed source file.
 * @returns The line count of the largest class, or 0 when there is none.
 */
function measureLongestClass(source: ts.SourceFile): number {
  let longest = 0;

  const visit = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      const start = source.getLineAndCharacterOfPosition(node.getStart(source)).line;
      const end = source.getLineAndCharacterOfPosition(node.getEnd()).line;
      longest = Math.max(longest, end - start + 1);
    }
    ts.forEachChild(node, visit);
  };

  ts.forEachChild(source, visit);
  return longest;
}

/**
 * Reports whether a node is exported.
 *
 * @param node - The declaration to inspect.
 * @returns True when the declaration carries an `export` modifier.
 */
function isExported(node: ts.Node): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

/**
 * Reports whether a node carries a TSDoc block immediately above it.
 *
 * @param node - The declaration to inspect.
 * @param text - The full text of the containing file.
 * @returns True when a `/** ... *\/` block precedes the declaration.
 */
function hasTsDoc(node: ts.Node, text: string): boolean {
  const ranges = ts.getLeadingCommentRanges(text, node.getFullStart()) ?? [];
  return ranges.some(
    (range) =>
      range.kind === ts.SyntaxKind.MultiLineCommentTrivia &&
      text.slice(range.pos, range.pos + 3) === '/**',
  );
}

/**
 * Counts documented and undocumented exported declarations.
 *
 * @param source - The parsed source file.
 * @param text - The full text of the file.
 * @returns The totals for this file.
 */
function measureDocumentation(
  source: ts.SourceFile,
  text: string,
): { documentable: number; documented: number } {
  let documentable = 0;
  let documented = 0;

  for (const statement of source.statements) {
    if (!DOCUMENTABLE_KINDS.has(statement.kind) || !isExported(statement)) {
      continue;
    }
    documentable += 1;
    if (hasTsDoc(statement, text)) {
      documented += 1;
    }
  }

  return { documentable, documented };
}

/**
 * Computes the maintainability index.
 *
 * The Coleman-Oman formula on its original 0-171 scale, over *logical* lines of
 * code. Both of those choices matter and are easy to get wrong:
 *
 * - The scale is not normalised to 0-100. Visual Studio divides by 171, but it
 *   also measures IL instructions rather than source, so its numbers are not
 *   comparable. On the normalised scale no file of any realistic size can score
 *   70 — a clean ten-line function tops out around 62 — which would make the
 *   required gate unreachable rather than demanding.
 * - `logicalLinesOfCode` counts statements, not physical lines, so a file is not
 *   punished for the TSDoc the same standards require it to carry.
 *
 * @param halsteadVolume - Halstead volume in bits.
 * @param cyclomaticComplexity - Total cyclomatic complexity.
 * @param logicalLinesOfCode - Executable statements and declarations.
 * @returns The index, clamped to 0-171.
 */
function maintainabilityIndex(
  halsteadVolume: number,
  cyclomaticComplexity: number,
  logicalLinesOfCode: number,
): number {
  if (logicalLinesOfCode === 0) {
    return 171;
  }
  const raw =
    171 -
    5.2 * Math.log(Math.max(halsteadVolume, 1)) -
    0.23 * cyclomaticComplexity -
    16.2 * Math.log(logicalLinesOfCode);
  return Math.min(171, Math.max(0, raw));
}

/**
 * Measures one source file.
 *
 * @param absolutePath - Absolute path to the file on disk.
 * @param displayPath - Repository-relative path to report it under.
 * @returns The file's metrics.
 */
export function measureFile(absolutePath: string, displayPath: string): FileMetrics {
  const text = readFileSync(absolutePath, 'utf8');
  const source = ts.createSourceFile(absolutePath, text, ts.ScriptTarget.ESNext, true);

  const logicalLinesOfCode = countLogicalLines(source);
  const cyclomaticComplexity = measureCyclomaticComplexity(source);
  const halsteadVolume = measureHalsteadVolume(source);
  const documentation = measureDocumentation(source, text);

  return {
    path: displayPath,
    logicalLinesOfCode,
    physicalLines: text.split('\n').length,
    cyclomaticComplexity,
    halsteadVolume,
    maintainabilityIndex: maintainabilityIndex(
      halsteadVolume,
      cyclomaticComplexity,
      logicalLinesOfCode,
    ),
    longestClassLines: measureLongestClass(source),
    documentableExports: documentation.documentable,
    documentedExports: documentation.documented,
  };
}
