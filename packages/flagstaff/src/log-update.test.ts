/**
 * The façade's own locks, on top of the 99 tests log-update's suite contributes through
 * `compat-oracle`.
 *
 * What that suite does *not* reach is unusually easy to state, because it is a single
 * shape: every one of its 99 cases builds a renderer with `createLogUpdate(stream)` and
 * drives it against a terminal emulator. It never imports the default export, never
 * imports `logUpdateStderr`, contains no `process` reference at all, and never kills a
 * process. So three things a migrating program depends on are ungraded upstream — the two
 * module-level stream bindings, the cursor control, and what happens to the cursor when
 * the process dies mid-frame — and they are graded here.
 *
 * The fourth is the layer guarantee this façade cannot keep, and it is recorded rather
 * than asserted away: see the R5 block below.
 */
import { execFileSync } from 'node:child_process';
import { closeSync, mkdtempSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import { createLogUpdate, type LogUpdateStream } from './log-update.js';

const ESC = '\u001B';

/** A stream shaped like a pipe: writable, not a terminal, remembering what it was given. */
function pipe(columns: number, rows: number): LogUpdateStream & { text: () => string } {
  const chunks: string[] = [];
  return {
    columns,
    rows,
    write: (s: string) => chunks.push(s),
    text: () => chunks.join(''),
  };
}

/**
 * R5, honestly. `flagstaff/log-update` **does** write cursor escapes off a terminal, and
 * that is not an oversight: log-update's own suite asserts erase sequences on a plain
 * non-TTY stream (`does not use synchronized output on non-tty streams` and every partial
 * update case counts `ESC[2K` on one), so a façade that suppressed them would fail the
 * suite that is the whole claim. `output-stack-compat` constraint 2 anticipates exactly
 * this: the divergence is allow-listed with its reason, here, where a reader looking for
 * it will be.
 *
 * What survives of R5 is the half that the original complaint was actually about — clack
 * #510, frames separated by carriage returns and captured whole by whatever read the pipe.
 * log-update moves by row (`ESC[nA`, `ESC[nB`, `ESC[G`), never by `\r`, so a captured
 * transcript is at least parseable. That half is asserted below, and the suite never does:
 * `\r` and `ESC[G` both leave the cursor at column zero and the emulator its cases assert
 * against cannot tell them apart, so the port could have used either and stayed at 99.
 *
 * A program that wants the guarantee rather than half of it uses `hoist()`, which is what
 * the static projection (U3) is for. The façade is the door, not the destination.
 */
/** Grow, change a middle row, shrink, persist, clear — every write path the façade has. */
function drive(stream: LogUpdateStream): void {
  const log = createLogUpdate(stream);
  log('one');
  log('one\ntwo');
  log('one\ntwo\nthree');
  log('one\nCHANGED\nthree');
  log('one');
  log.persist('kept');
  log('after');
  log.clear();
  log('again');
  log.done();
}

describe('R5 · the façade writes no carriage return, on a terminal or off one', () => {
  it('off a terminal', () => {
    const stream = pipe(40, 20);
    drive(stream);
    expect(stream.text()).not.toContain('\r');
    // Not vacuous: the frames really were drawn, so there was something to do it with.
    expect(stream.text()).toContain(`${ESC}[2K`);
  });

  it('on one', () => {
    const stream = { ...pipe(40, 20), isTTY: true };
    drive(stream);
    expect(stream.text()).not.toContain('\r');
    expect(stream.text()).toContain(`${ESC}[?2026h`);
  });

  it('and never a bare cursor-home either — every move is a row move', () => {
    const stream = pipe(40, 20);
    drive(stream);
    // `ESC[H` and `ESC[;H` home the cursor absolutely, which would trample whatever is
    // above the frame. log-update only ever moves relatively.
    expect(stream.text()).not.toMatch(/\u001B\[[0-9;]*H/);
  });
});

/**
 * `wrap()` is graded against wrap-ansi in `wrap.test.ts`; what is asserted here is that the
 * façade actually reaches it with the options that make a row self-contained. The suite
 * covers wrapping through the emulator, which normalises the styles away — so a port that
 * let a colour leak across a row break would still read correctly on screen and pass.
 */
describe('a wrapped frame keeps each row self-contained', () => {
  it('closes a colour at the break and reopens it on the next row', () => {
    const stream = pipe(10, 20);
    createLogUpdate(stream)(`${ESC}[31m${'x'.repeat(25)}${ESC}[39m`);
    const rows = stream.text().split('\n').filter((r) => r !== '');
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) {
      expect(row).toContain(`${ESC}[31m`);
      expect(row).toContain(`${ESC}[39m`);
    }
  });
});

/**
 * The two module-level bindings. log-update's suite imports neither — it builds every
 * renderer with `createLogUpdate` — so `logUpdate` writing to stdout and `logUpdateStderr`
 * writing to stderr is asserted nowhere upstream, and it is the first thing a migrating
 * program depends on (`import logUpdate from 'log-update'` is the whole README).
 *
 * Run against the **built** entry, in a child process, with the two descriptors pointed at
 * separate files: nothing else can tell the two streams apart.
 */
const distLogUpdate = new URL('../dist/log-update.js', import.meta.url).href;

function runChild(body: string[]): { out: string; err: string } {
  const dir = mkdtempSync(join(tmpdir(), 'flagstaff-log-update-'));
  const child = join(dir, 'child.mjs');
  const outPath = join(dir, 'fd1');
  const errPath = join(dir, 'fd2');
  writeFileSync(child, body.join('\n'));

  const out = openSync(outPath, 'w');
  const err = openSync(errPath, 'w');
  try {
    execFileSync(process.execPath, [child], { stdio: ['ignore', out, err], timeout: 20_000 });
  } finally {
    closeSync(out);
    closeSync(err);
  }
  return { out: readFileSync(outPath, 'utf8'), err: readFileSync(errPath, 'utf8') };
}

describe('the default export and the stderr variant are bound to the right stream', () => {
  it(
    'logUpdate goes to stdout and logUpdateStderr to stderr, and neither to the other',
    () => {
      const { out, err } = runChild([
        `const m = await import(${JSON.stringify(distLogUpdate)});`,
        "m.default('to-stdout');",
        "m.logUpdateStderr('to-stderr');",
      ]);
      expect(out).toContain('to-stdout');
      expect(out).not.toContain('to-stderr');
      expect(err).toContain('to-stderr');
      expect(err).not.toContain('to-stdout');
    },
    30_000,
  );
});

/**
 * The cursor, which log-update's suite cannot see at all: under its runner `process.stderr`
 * is not a terminal, so `hideCursor()` returns immediately and every one of the 99 runs
 * with the cursor path switched off. This is the same blind spot `flagstaff/ora` shipped a
 * defect through — 99 / 99 with no cursor restored on a signal — and the same fix answers
 * both, which is why `cursor.ts` is one module and not two.
 *
 * Proven to fail on the unfixed state: with `process.once('exit', …)` and nothing else —
 * which is what a straight port of `restore-cursor` minus `signal-exit` gives you, and what
 * this façade was first written with — `show` is 0 for all three signals, because node does
 * not run `'exit'` listeners for a process terminated by a signal that has no listener.
 *
 * Skipped on Windows, where `process.kill(process.pid, …)` is an unconditional terminate
 * rather than a real signal delivery, so the assertion would grade node's emulation. The
 * listeners are still installed there, `SIGBREAK` included.
 */
const HIDE_CURSOR = `${ESC}[?25l`;
const SHOW_CURSOR = `${ESC}[?25h`;

interface SignalOutcome {
  hide: number;
  show: number;
  killedBy: string | null;
  status: number | null;
  /** How many times the child's *own* SIGINT handler ran. Meaningful only when one was installed. */
  ownHandlerRuns: number;
}

function renderThenSignal(signal: string, ownHandler = false): SignalOutcome {
  const dir = mkdtempSync(join(tmpdir(), 'flagstaff-log-update-signal-'));
  const log = join(dir, 'fd2');
  const child = join(dir, 'child.mjs');
  writeFileSync(
    child,
    [
      // The only condition the cursor path checks. The frame itself goes to a buffer, so
      // the file collects the cursor sequences and nothing else.
      'process.stderr.isTTY = true;',
      // A program that took SIGINT over itself must survive: a renderer does not get to
      // terminate a process whose author asked to handle the signal. It writes a marker on
      // every entry, because the failure this grades is the handler running **twice** —
      // see the note on the case below.
      ownHandler
        ? "let n = 0; process.on('SIGINT', () => { process.stderr.write('OWN-HANDLER-RAN'); if (++n === 1) setTimeout(() => process.exit(7), 300); });"
        : '',
      `const { createLogUpdate } = await import(${JSON.stringify(distLogUpdate)});`,
      'const log = createLogUpdate({ write() {}, columns: 80, rows: 24 });',
      "log('frame');",
      `setTimeout(() => process.kill(process.pid, '${signal}'), 80);`,
      'setTimeout(() => process.exit(0), 5000);',
    ].join('\n'),
  );

  const fd = openSync(log, 'w');
  // `execFileSync` throws when the child does not exit 0 — which is the point here, since
  // the signal must still terminate it. The throw carries `.signal`, and that is the result.
  let killedBy: string | null = null;
  let status: number | null = 0;
  try {
    execFileSync(process.execPath, [child], { stdio: ['ignore', 'pipe', fd], timeout: 20_000 });
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

describe.skipIf(process.platform === 'win32')('a cursor hidden mid-frame comes back when the process is signalled', () => {
  it.each(['SIGINT', 'SIGTERM', 'SIGHUP'])(
    '%s puts the cursor back, and still terminates',
    (signal) => {
      const observed = renderThenSignal(signal);
      expect(observed.hide).toBe(1);
      expect(observed.show).toBe(1);
      // The re-raise. Suppressing node's default action would be a worse bug than the one
      // this test was written for.
      expect(observed.killedBy).toBe(signal);
    },
    30_000,
  );

  /**
   * The other half of the re-raise, and the half nothing graded until now. `cursor.ts`
   * re-raises **only** when `process.listenerCount(signal) === 0`; drop that condition and
   * all three cases above still pass, because none of them installs a handler of its own.
   * The claim "a renderer does not get to overrule a program that took SIGINT for itself"
   * is made in `cursor.ts`, in `flagstaff/design.md` and in the README, so it needs a check.
   *
   * **`ownHandlerRuns` is that check, and the other three assertions are not.** Measured by
   * deleting the `listenerCount` guard from the built `dist/cursor.js`: the child is still
   * not killed and still exits 7, because the unconditional re-raise is caught by the
   * child's *own* handler rather than by node's default action. What actually changes is
   * that the program's handler is entered **twice for one Ctrl+C** — which is the bug, and
   * which only a count can see. Asserted at exactly 1; it is 2 on the unfixed state.
   */
  it(
    'does not terminate a program that installed its own SIGINT handler, and delivers it once',
    () => {
      const observed = renderThenSignal('SIGINT', true);
      expect(observed.ownHandlerRuns).toBe(1);
      expect(observed.show).toBe(1);
      expect(observed.killedBy).toBeNull();
      expect(observed.status).toBe(7);
    },
    30_000,
  );
});
