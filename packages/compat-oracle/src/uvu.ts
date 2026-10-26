/**
 * The `uvu` runner: a suite run by uvu's CLI, read by the counts uvu prints.
 *
 * `uvu` is how kleur tests itself (`npm test` is `uvu -r esm -i utils -i xyz`). uvu's CLI requires
 * every file, runs every `test()` it registered, and prints one summary on stdout — `Total`, the
 * cases it ran, `Passed`, and `Skipped`, which `Total` leaves out — then exits 1 if any case
 * failed and 0 if none did. uvu names a failing case and never a passing one, so, as with twist,
 * the summary is turned into the `# tests / # pass / # fail` lines the oracle already reads, and
 * there is nothing to exclude by.
 *
 * A file uvu cannot load throws out of its CLI before any summary (exit 1, a stack on stderr), so
 * each file runs on its own: that file is one failure and the rest are still counted, the rule
 * `twist.ts` keeps for the same reason.
 *
 * **`-r esm` is substituted** by tsx (`Host.tsLoader`). The `esm` package does not start on
 * Node 24 (the `colour-facades` spec, re-grounding 3), and what it gave kleur's suite tsx gives it
 * too: ES module syntax in `.js` files under a root with no `type`, `./utils` resolved to
 * `./utils.js`, and `uvu` resolved to the CommonJS build uvu's own CLI queues on — through the
 * `import` condition it would be a second uvu, whose queue the CLI never reads.
 *
 * The spawning is `run.ts`'s (`runUvuFiles`); this module is the pure half.
 */
import { strip } from 'linegauge/strip';

/** uvu's counts for one file. `total` is the cases run; `skipped` is outside it, as uvu prints it. */
export interface UvuCounts {
  total: number;
  passed: number;
  skipped: number;
}

/** One file's run: what uvu printed and how the process ended. */
export interface UvuRun {
  file: string;
  /** The exit status, or `null` when a signal or the timeout ended it. */
  status: number | null;
  stdout: string;
  stderr: string;
}

const TOTAL = /^\s*Total:\s+(\d+)\s*$/m;
const PASSED = /^\s*Passed:\s+(\d+)\s*$/m;
const SKIPPED = /^\s*Skipped:\s+(\d+)\s*$/m;

/**
 * The counts on uvu's summary, or `undefined` when it printed none, printed one with a line
 * missing, or one that passed more cases than it ran.
 */
export function uvuCounts(stdout: string): UvuCounts | undefined {
  // Its colours are escape sequences, which linegauge strips; `Passed` opens one and `Total` closes none.
  const text = strip(stdout);
  const [total, passed, skipped] = [TOTAL, PASSED, SKIPPED].map((line) => line.exec(text)?.[1]);
  if (total === undefined || passed === undefined || skipped === undefined || Number(passed) > Number(total)) return undefined;
  return { total: Number(total), passed: Number(passed), skipped: Number(skipped) };
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
 * - **A summary**, whatever the exit code, is a finished file: its counts. uvu exits 1 when a
 *   case failed, and prints the summary first.
 * - **A non-zero exit and no summary** is a file uvu could not load, and it is **one failure**,
 *   never a pass and never nothing: the reference the control fixed still divides the target.
 * - **Exit 0 and no summary**, or **no exit status at all** (killed, timed out), is an error:
 *   uvu exits 0 with nothing counted only when a case never settled and left Node nothing to wait on.
 */
export function uvuTap(runs: readonly UvuRun[]): { output: string } | { error: string } {
  const total = { passed: 0, failed: 0, skipped: 0 };
  const lines: string[] = [];
  for (const { file, status, stdout, stderr } of runs) {
    if (status === null) return { error: `${file}: uvu was killed before it finished` };
    const counts = uvuCounts(stdout);
    if (counts === undefined) {
      if (status === 0) return { error: `${file}: uvu exited 0 with no summary: ${firstLine(stderr)}` };
      lines.push(`# ${file}: uvu exited ${String(status)} before its summary, counted as one failure: ${firstLine(stderr)}`);
      total.failed += 1;
      continue;
    }
    const failed = counts.total - counts.passed;
    lines.push(`# ${file}: ${String(counts.passed)} passed, ${String(failed)} failed, ${String(counts.skipped)} skipped`);
    total.passed += counts.passed;
    total.failed += failed;
    total.skipped += counts.skipped;
  }
  // node:test's dialect: `# tests` counts a skip, and `# skipped` takes it back out.
  lines.push(`# tests ${String(total.passed + total.failed + total.skipped)}`, `# pass ${String(total.passed)}`, `# fail ${String(total.failed)}`);
  if (total.skipped > 0) lines.push(`# skipped ${String(total.skipped)}`);
  return { output: `${lines.join('\n')}\n` };
}
