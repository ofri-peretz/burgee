/**
 * The `tsd` runner: a type-only suite, graded one assertion at a time.
 *
 * `tsd` is how `@commander-js/extra-typings` tests itself (`npm test` is `tsd`). It compiles the
 * test files against the package's declarations and reports diagnostics: an `expectType` whose
 * types are not identical, an `expectError` that found no error, and any ordinary compile error.
 * It prints no per-case line, so there is nothing for a TAP parser to read, and a suite graded as
 * "the file compiled" would read a 182-assertion file as one case. That is the count this module
 * exists to refuse.
 *
 * So a run is two halves. The **child** (`TSD_SCRIPT`, in `run.ts`) runs inside the vendored root, loads the
 * suite's own pinned `tsd`, and prints two lists as JSON: every assertion call site, found by
 * tsd's own `extractAssertions` over a program built with tsd's own compiler options, and every
 * diagnostic `tsd()` returned. The **parent** (`tsdTap`) turns those into the flat TAP the rest
 * of the oracle already counts: one `ok`/`not ok` per assertion, failing when an error diagnostic
 * falls inside its span, and one `not ok` for each error outside every assertion — a type surface
 * that breaks a line the suite only expects to compile is a failure of the suite, and dropping it
 * because no assertion owns it would flatter the target.
 */
import { relative, sep } from 'node:path';

/** One assertion call site, as the child reports it. Lines are 1-based, as tsd's diagnostics are. */
export interface TsdAssertion {
  fileName: string;
  /** tsd's assertion name: `expectType`, `expectError`, … */
  name: string;
  line: number;
  endLine: number;
}

/** One entry of what `tsd()` resolves to — its own `Diagnostic` shape. */
export interface TsdDiagnostic {
  fileName: string;
  message: string;
  severity: 'error' | 'warning';
  line?: number;
  column?: number;
}

export interface TsdReport {
  assertions: TsdAssertion[];
  diagnostics: TsdDiagnostic[];
}

/** What the child prints when tsd itself failed — could not load, or threw — rather than reporting. */
export interface TsdFailure {
  error: string;
}

/**
 * Call sites tsd treats as assertions and that assert nothing. `printType` prints the type of
 * its argument as a *warning*; it can never fail, so counting it would pad the denominator with
 * a case that passes for every implementation.
 */
const NOT_A_CASE = new Set(['printType']);

/** How much of a stray diagnostic's message a TAP title keeps: its first line, bounded. */
const TITLE_MESSAGE = 120;

/** A path as a TAP title carries it: relative to the vendored root, posix. */
const shown = (root: string, fileName: string): string => relative(root, fileName).split(sep).join('/');

const within = (d: TsdDiagnostic, a: TsdAssertion): boolean => d.fileName === a.fileName && d.line !== undefined && d.line >= a.line && d.line <= a.endLine;

/**
 * The child's report as flat TAP: a `1..n` plan and one line per case, which `summarize()` reads
 * through the dialect it already reads for vitest — so exclusions by title, `COMPAT_TAP_DIR` and
 * the control's reference all apply to a type suite with no code of their own.
 *
 * Titles are `<file>:<line> <assertion>`, stable for a vendored suite, so an exclusion can name
 * one exactly. Ordered by file and line, so two runs of one suite print the same lines.
 */
export function tsdTap(report: TsdReport, root: string): string {
  const errors = report.diagnostics.filter((d) => d.severity === 'error');
  const cases = report.assertions.filter((a) => !NOT_A_CASE.has(a.name)).sort((x, y) => x.fileName.localeCompare(y.fileName) || x.line - y.line);
  const lines = cases.map((a, i) => `${errors.some((d) => within(d, a)) ? 'not ok' : 'ok'} ${i + 1} - ${shown(root, a.fileName)}:${a.line} ${a.name}`);
  // Owned by no assertion: an `@ts-expect-error` that found nothing, a chained call the surface
  // no longer allows, an import the target does not export. Each is a failure, never dropped.
  const stray = errors.filter((d) => !report.assertions.some((a) => within(d, a)));
  for (const d of stray) {
    const message = d.message.replace(/\n[\s\S]*/, '').replaceAll(root, '.').slice(0, TITLE_MESSAGE);
    lines.push(`not ok ${lines.length + 1} - ${shown(root, d.fileName)}:${d.line ?? 0} outside any assertion: ${message}`);
  }
  return `TAP version 13\n${lines.join('\n')}${lines.length > 0 ? '\n' : ''}1..${lines.length}\n`;
}

/**
 * The declaration file TypeScript reads for a generated shim: `shim.js` is typed by `shim.d.ts`,
 * `shim.mjs` by `shim.d.mts`. A type suite's `import … from '../shim.js'` resolves there, so the
 * shim's `export * from '<target>'` is what the assertions are checked against.
 */
export function declarationName(shim: string): string {
  const dot = shim.lastIndexOf('.');
  return `${shim.slice(0, dot)}.d.${shim.slice(dot + 1).replace('js', 'ts')}`;
}
