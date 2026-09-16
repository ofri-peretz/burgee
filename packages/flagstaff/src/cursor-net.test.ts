/**
 * The cursor net, when more than one surface in the same program has hidden a cursor.
 *
 * `ora.test.ts`, `log-update.test.ts` and `loop-signal.test.ts` each drive **one** surface and
 * assert it restores its cursor on a signal. None of them drives two at once, and that is the
 * case the package changed shape in on 2026-09-15: `src/cursor.ts` went away and all three
 * surfaces now reach `closeout`.
 *
 * The module that went away carried a process-wide `cursorRestoreInstalled` flag — first
 * caller installs the net, every later caller gets a no-op back. That reads like a guard
 * against a duplicate restore. **It was not: it was a lost one.** The second surface's writer
 * was never registered at all, so when the two surfaces drew on different streams the second
 * stream's cursor was hidden and never put back. Measured on the pre-consolidation build,
 * signalled at 80 ms with a hoisted frame on fd 1 and an ora spinner on fd 2:
 *
 *     stdout { hide: 1, show: 1 }   stderr { hide: 1, show: 0 }   ← the cursor is gone
 *
 * closeout registers per caller, so both are registered and both are restored. The first case
 * below is that fix, and it fails on the old build for the reason above.
 *
 * Driven against the built `dist/` in a really-signalled child, for the same reason the
 * sibling suites are: node runs `'exit'` listeners for a normal exit and skips them for a
 * signal, so none of this is observable in-process.
 */
import { execFileSync } from 'node:child_process';
import { closeSync, mkdtempSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import { HIDE_CURSOR, SHOW_CURSOR } from './projection.js';

const distLoop = new URL('../dist/loop.js', import.meta.url).href;
const distOra = new URL('../dist/ora.js', import.meta.url).href;

/** Cursor operations seen on one file descriptor. */
interface StreamCount {
  hide: number;
  show: number;
}

interface Outcome {
  stdout: StreamCount;
  stderr: StreamCount;
  killedBy: string | null;
}

/**
 * Nothing is interpolated into the child: every value arrives on `argv`, so the source it runs
 * is a fixed string rather than one this file assembles. `loop-signal.test.ts` explains why at
 * length — CodeQL reads an interpolated child as code construction, and a child assembled by
 * template is one nobody can read without mentally running the template.
 *
 * `split` decides where the frame draws. `'apart'` puts the hoisted frame on fd 1 and leaves
 * the spinner on fd 2, which is the case that grades the fix; `'together'` puts both on fd 2.
 */
const CHILD = `
import process from 'node:process';

const [, , distLoop, distOra, split, signal, hide, show] = process.argv;

// The only condition either cursor path checks.
process.stdout.isTTY = true;
process.stderr.isTTY = true;
process.stderr.columns = 80;
process.stderr.cursorTo = () => true;
process.stderr.clearLine = () => true;
process.stderr.moveCursor = () => true;

const { hoist } = await import(distLoop);
const { default: ora } = await import(distOra);

// Only the cursor operations are forwarded; the frames themselves go nowhere, so each log
// collects the two sequences under test and nothing else.
const CURSOR = new Set([hide, show]);
const frameTarget = split === 'apart' ? process.stdout : process.stderr;
const out = { write: (s) => { if (CURSOR.has(s)) frameTarget.write(s); } };
// A real clock: the frame has to still be open when the signal arrives.
const clock = { now: () => Date.now(), schedule: (fn, ms) => { const t = setTimeout(fn, ms); return () => clearTimeout(t); } };
const rt = { env: {}, isTTY: { stdout: true }, stdout: out, stderr: { write() {} }, clock };
const spin = { name: 'x', interval: 80, static: () => 'done', frame: () => 'working' };

// Two surfaces, both holding a hidden cursor at the moment the signal lands.
hoist(spin, rt, { text: 'go' });
ora({ isEnabled: true, hideCursor: true, discardStdin: false, text: 'probe' }).start();

setTimeout(() => process.kill(process.pid, signal), 80);
setTimeout(() => process.exit(0), 5000);
`;

function twoSurfacesThenSignal(split: 'apart' | 'together', signal: string): Outcome {
  const dir = mkdtempSync(join(tmpdir(), 'flagstaff-cursor-net-'));
  const outLog = join(dir, 'fd1');
  const errLog = join(dir, 'fd2');
  const child = join(dir, 'child.mjs');
  writeFileSync(child, CHILD);

  // Both descriptors point at files: writes to a file are synchronous in node, so nothing is
  // lost when the process is killed outright.
  const fd1 = openSync(outLog, 'w');
  const fd2 = openSync(errLog, 'w');
  let killedBy: string | null = null;
  try {
    execFileSync(process.execPath, [child, distLoop, distOra, split, signal, HIDE_CURSOR, SHOW_CURSOR], { stdio: ['ignore', fd1, fd2], timeout: 20_000 });
  } catch (error) {
    killedBy = (error as { signal?: string | null }).signal ?? null;
  } finally {
    closeSync(fd1);
    closeSync(fd2);
  }

  const count = (file: string, needle: string): number => readFileSync(file, 'utf8').split(needle).length - 1;
  return {
    stdout: { hide: count(outLog, HIDE_CURSOR), show: count(outLog, SHOW_CURSOR) },
    stderr: { hide: count(errLog, HIDE_CURSOR), show: count(errLog, SHOW_CURSOR) },
    killedBy,
  };
}

// Windows' `process.kill` on self is an unconditional terminate rather than real signal
// delivery, so there is nothing here to observe. The registrations still happen there.
describe.skipIf(process.platform === 'win32')('two surfaces holding a hidden cursor', () => {
  /**
   * The invariant, and the one that matters: **every stream whose cursor was hidden gets it
   * back.** Not "one restore happens" — a count of restores says nothing about which terminal
   * the user is left looking at.
   *
   * Proven to fail on the pre-consolidation build: `stderr.show` is 0 there, because the
   * hoisted frame installed the process's only net and the spinner's registration was
   * discarded by `cursorRestoreInstalled`.
   */
  it.each(['SIGINT', 'SIGTERM', 'SIGHUP'])('%s puts back both cursors when the two draw on different streams', (signal) => {
    const outcome = twoSurfacesThenSignal('apart', signal);
    expect(outcome.stdout).toEqual({ hide: 1, show: 1 });
    expect(outcome.stderr).toEqual({ hide: 1, show: 1 });
    expect(outcome.killedBy).toBe(signal);
  });

  /**
   * The cost of registering per caller rather than per process, stated rather than hidden.
   *
   * Two surfaces on one stream hide it twice and show it twice. The second show is redundant —
   * `ESC[?25h` is idempotent, which is the property `closeout/cursor` relies on to make a
   * restore safe from an exit path that may run after a caller has already cleaned up — so the
   * user sees a cursor either way. The old module wrote one show here and paid for it with the
   * lost restore the case above grades; one redundant byte sequence is the better trade.
   *
   * Pinned at 2 rather than `>= 1` so that de-duplicating per stream, if anyone does it, shows
   * up here as a decision instead of drifting through.
   */
  it('writes one redundant, idempotent show when the two draw on the same stream', () => {
    const outcome = twoSurfacesThenSignal('together', 'SIGINT');
    expect(outcome.stdout).toEqual({ hide: 0, show: 0 });
    expect(outcome.stderr).toEqual({ hide: 2, show: 2 });
    expect(outcome.killedBy).toBe('SIGINT');
  });
});
