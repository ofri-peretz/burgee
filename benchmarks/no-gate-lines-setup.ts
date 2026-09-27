/**
 * Lock — no benchmarks test prints a gate failure into the CI log.
 *
 * `ratchet.test.ts` feeds `verdict()` a measurement one step past each gate, on purpose, and
 * `verdict()` explains each failure on stderr. Vitest relays a test's stderr into the log, so
 * every Compatibility run — green ones included — carried lines like `✖ flagstaff/boxen ÷
 * boxen bundled-bytes-ratio: 1.001 ratio is above its ceiling of 1` and `✖ commander
 * passing-tests: 1359 tests is below its floor of 1360`. When a job went red for an unrelated
 * reason (#478's PowerShell completion case, #586's installed-size cell), those were the lines
 * a reader found by searching for "gate failure", and they were read as measurements: a boxen
 * bundle measured tiny in CI, a commander case lost in CI, the compat axis broken in CI. None
 * of it was measured anywhere; it was the fixtures.
 *
 * So a `✖ ` line that reaches the real console fails the test that printed it. A test that
 * means to exercise the message spies on `console.error` (as `ratchet.test.ts` does), which
 * replaces this wrapper for that test, so the line is captured instead of printed.
 */
import { afterEach } from 'vitest';

const GATE_LINE = /^\s*✖ /u;
const leaked: string[] = [];
const print = console.error.bind(console);
console.error = (...args: unknown[]): void => {
  const line = args.map(String).join(' ');
  if (GATE_LINE.test(line)) leaked.push(line.trim());
  print(...args);
};

afterEach(() => {
  const lines = leaked.splice(0);
  if (lines.length > 0) {
    throw new Error(`this test printed ${String(lines.length)} gate failure(s) into the log, where they read as measurements — spy on console.error:\n${lines.join('\n')}`);
  }
});
