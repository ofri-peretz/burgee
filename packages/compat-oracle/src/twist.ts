/**
 * The `twist` runner: a suite whose runner exits 0 whether its assertions pass or fail.
 *
 * `twist` is how colorette tests itself (`npm test` is `c8 twist tests/*.js`). Each file
 * default-exports a tree of `t(name, [...])` nodes whose leaves are `equal(actual, expected)`
 * assertions, and the CLI imports every file, checks every leaf, draws its view on stderr and
 * calls `process.exit(0)` — the same code for 67 passes as for 58 failures (measured against
 * colorette itself off a terminal, `colour-facades` spec, re-grounding 4). Only a file that cannot
 * be loaded exits 1. So the exit code is no measurement here, and a runner that read it, as
 * `exit-code` does, would publish a suite of failures as a pass.
 *
 * The measurement is the counts twist prints: `Tests:  58 failed, 9 passed, 67 total`, the last
 * line of that name in its view. twist names a failing case and never a passing one, so there is
 * no per-case line to count or to exclude by; the summary is turned into the `# tests / # pass /
 * # fail` lines the rest of the oracle already reads, and an exclusion on a twist host is refused
 * the way it is on any runner without case names (`summarize`).
 *
 * The spawning is `run.ts`'s (`runTwistFiles`); this module is the pure half, one file's outcome
 * at a time, so a red test can hand it exactly what twist prints.
 */
import { strip } from 'linegauge/strip';

/** twist's counts for one file. Its `running` count is not here: a finished run has none. */
export interface TwistCounts {
  passed: number;
  failed: number;
  skipped: number;
}

/** One file's run: what twist printed on stderr and how the process ended. */
export interface TwistRun {
  file: string;
  /** The exit status, or `null` when a signal or the timeout ended it. */
  status: number | null;
  stderr: string;
}

const COUNT = /(\d+) (failed|passed|skipped|total)/g;

/**
 * The counts on the last `Tests:` line of twist's view, or `undefined` when it printed none or
 * printed one that does not add up to its own total.
 *
 * The last, because twist redraws the whole view on every assertion when `CI` is unset, and the
 * last frame is the finished one; with `CI` set, as upstream's workflow runs it, there is one.
 */
export function twistCounts(stderr: string): TwistCounts | undefined {
  // Its colours and its clear-screen are escape sequences, which linegauge strips.
  const line = strip(stderr)
    .split('\n')
    .reverse()
    .find((l) => l.startsWith('Tests:'));
  if (line === undefined) return undefined;
  // twist leaves a zero count out of the line, so an absent word is 0 — except `total`, which it always prints.
  const found = new Map<string, number>();
  for (const [, n, word] of line.matchAll(COUNT)) found.set(word as string, Number(n));
  const [passed, failed, skipped] = ['passed', 'failed', 'skipped'].map((word) => found.get(word) ?? 0) as [number, number, number];
  return passed + failed + skipped === found.get('total') ? { passed, failed, skipped } : undefined;
}

/** The first line of `stderr` that says something, for a reason in a report. */
const firstLine = (stderr: string): string =>
  strip(stderr)
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l !== '' && !l.startsWith('at ')) ?? 'nothing on stderr';

/**
 * The runs of every graded file as the TAP summary `summarize` reads, or the error that means the
 * oracle, not the target, is broken.
 *
 * - **Exit 0 with a summary** is a finished file: its counts, whatever they say.
 * - **A non-zero exit** is a file twist could not load (a missing export is one), and it is
 *   **one failure**, never a pass and never nothing: the reference the control fixed still divides
 *   the target, so the cases the file would have registered are counted short, as a node:test
 *   file that dies at load is.
 * - **Exit 0 and no summary that adds up**, or **no exit status at all** (killed, timed out), is
 *   an error: neither is something twist does when it ran to the end.
 */
export function twistTap(runs: readonly TwistRun[]): { output: string } | { error: string } {
  const total: TwistCounts = { passed: 0, failed: 0, skipped: 0 };
  const lines: string[] = [];
  for (const { file, status, stderr } of runs) {
    if (status === null) return { error: `${file}: twist was killed before it finished` };
    if (status !== 0) {
      lines.push(`# ${file}: twist exited ${String(status)} before its summary, counted as one failure: ${firstLine(stderr)}`);
      total.failed += 1;
      continue;
    }
    const counts = twistCounts(stderr);
    if (counts === undefined) return { error: `${file}: twist exited 0 with no summary that adds up: ${firstLine(stderr)}` };
    lines.push(`# ${file}: ${String(counts.passed)} passed, ${String(counts.failed)} failed, ${String(counts.skipped)} skipped`);
    total.passed += counts.passed;
    total.failed += counts.failed;
    total.skipped += counts.skipped;
  }
  // node:test's dialect: `# tests` counts a skip, and `# skipped` takes it back out.
  lines.push(`# tests ${String(total.passed + total.failed + total.skipped)}`, `# pass ${String(total.passed)}`, `# fail ${String(total.failed)}`);
  if (total.skipped > 0) lines.push(`# skipped ${String(total.skipped)}`);
  return { output: `${lines.join('\n')}\n` };
}
