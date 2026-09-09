/**
 * R5's sibling. `close()` puts the cursor back, and `close()` does not run when a signal ends
 * the process — so Ctrl+C during a frame left the user's terminal with no cursor at all
 * (issue #60). Neither incumbent has that defect: ora and log-update both reach
 * cli-cursor → restore-cursor → signal-exit, and since 2026-09-08 both façades here reach
 * `cursor.js`. The loop is the surface this package actually asks people to adopt, so it has
 * to hold the same guarantee.
 *
 * Driven against the built `dist/`, in a child process that is really signalled, because none
 * of this is observable in-process: node runs `'exit'` listeners for a normal exit and skips
 * them for a signal, which is the entire bug.
 */
import { execFileSync } from 'node:child_process';
import { closeSync, mkdtempSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import { HIDE_CURSOR, SHOW_CURSOR } from './projection.js';

const distLoop = new URL('../dist/loop.js', import.meta.url).href;

interface SignalOutcome {
  hide: number;
  show: number;
  killedBy: string | null;
  status: number | null;
  /** How many times the child's *own* SIGINT handler ran. Meaningful only when one was installed. */
  ownHandlerRuns: number;
}

/**
 * The child, as a constant. Nothing is interpolated into it: every value it needs arrives on
 * `argv`, so the source it runs is a fixed string rather than one this file assembles.
 *
 * That is not only CodeQL's preference (it flagged the interpolated version as code
 * construction from an unsanitised value, and it was right about the shape even though every
 * value here is a local constant). A child assembled by template is a child nobody can read
 * without mentally running the template, and this one exists to be read: it is the only place
 * in the suite where a real signal meets a real frame.
 */
const CHILD = `
import process from 'node:process';

const [, , distLoop, mode, signal, hide, show] = process.argv;

// Installed before the loop, because the guard under test is \`listenerCount('SIGINT')\`:
// a program that took the signal over itself must survive, and must see it exactly once.
if (mode === 'own') {
  let n = 0;
  process.on('SIGINT', () => {
    process.stderr.write('OWN-HANDLER-RAN');
    if (++n === 1) setTimeout(() => process.exit(7), 300);
  });
}

const { hoist } = await import(distLoop);

// Only the cursor operations reach fd 2; the frames go nowhere, so the log collects the two
// sequences under test and nothing else.
const CURSOR = new Set([hide, show]);
const out = { write: (s) => { if (CURSOR.has(s)) process.stderr.write(s); } };
// A real clock, not \`manualClock()\`: the frame has to still be open when the signal
// arrives, which is the whole scenario.
const clock = { now: () => Date.now(), schedule: (fn, ms) => { const t = setTimeout(fn, ms); return () => clearTimeout(t); } };
const rt = { env: {}, isTTY: { stdout: true }, stdout: out, stderr: { write() {} }, clock };
const spin = { name: 'x', interval: 80, static: () => 'done', frame: () => 'working' };

hoist(spin, rt, { text: 'go' });
setTimeout(() => process.kill(process.pid, signal), 80);
setTimeout(() => process.exit(0), 5000);
`;

function hoistThenSignal(signal: string, ownHandler = false): SignalOutcome {
  const dir = mkdtempSync(join(tmpdir(), 'flagstaff-loop-signal-'));
  const log = join(dir, 'fd2');
  const child = join(dir, 'child.mjs');
  writeFileSync(child, CHILD);

  const fd = openSync(log, 'w');
  // `execFileSync` throws when the child does not exit 0 — which is the point, since the
  // signal must still terminate it. The throw carries `.signal`, and that is the result.
  let killedBy: string | null = null;
  let status: number | null = 0;
  try {
    execFileSync(process.execPath, [child, distLoop, ownHandler ? 'own' : 'none', signal, HIDE_CURSOR, SHOW_CURSOR], { stdio: ['ignore', 'pipe', fd], timeout: 20_000 });
  } catch (error) {
    const failure = error as { status?: number | null; signal?: string | null };
    killedBy = failure.signal ?? null;
    status = failure.status ?? null;
  } finally {
    closeSync(fd);
  }

  const written = readFileSync(log, 'utf8');
  const count = (needle: string): number => written.split(needle).length - 1;
  return { hide: count(HIDE_CURSOR), show: count(SHOW_CURSOR), killedBy, status, ownHandlerRuns: count('OWN-HANDLER-RAN') };
}

// Windows' `process.kill` on self is an unconditional terminate rather than real signal
// delivery, so there is nothing here to observe.
describe.skipIf(process.platform === 'win32')('a cursor hidden by hoist() comes back when the process is signalled', () => {
  it.each(['SIGINT', 'SIGTERM', 'SIGHUP'])('%s puts the cursor back, and still terminates', (signal) => {
    const outcome = hoistThenSignal(signal);
    expect(outcome.hide).toBe(1);
    expect(outcome.show).toBe(1);
    expect(outcome.killedBy).toBe(signal);
  });

  it('does not terminate a program that installed its own SIGINT handler, and delivers it once', () => {
    const outcome = hoistThenSignal('SIGINT', true);
    expect(outcome.show).toBe(1);
    expect(outcome.killedBy).toBeNull();
    expect(outcome.status).toBe(7);
    // The whole point of the `listenerCount` guard: re-raising unconditionally would run the
    // program's own handler a second time for one Ctrl+C.
    expect(outcome.ownHandlerRuns).toBe(1);
  });
});
