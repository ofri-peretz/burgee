/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Design R4 on real children: the bytes a process leaves on its terminal when it really
 * exits, by each door R4 names.
 *
 * `restore.test.ts` drives a fake process, so it can only ever see what closeout *asked* the
 * terminal to do. This file spawns node, lets it die — by falling off the end, by
 * `process.exit()`, by a throw, by a real signal, past a real deadline — and reads the child's
 * fd 2 back byte for byte. The shape is `signal.test.ts`'s: fd 2 is a file handed to the
 * child, because writes to a file descriptor are synchronous in node and nothing queued is
 * lost when the process is terminated outright.
 *
 * **What is real and what is not.** The exit, the signal, the deadline and the bytes are
 * real. The terminal is not: a spawned child has no PTY, so the child sets `isTTY` on its own
 * stderr (as `signal.test.ts` does) and passes a keyboard whose `setRawMode` writes a marker
 * to fd 2. That is deliberate, not a shortcut. On a real PTY node resets the TTY mode of its
 * own stdio as it exits, so a raw-mode assertion made through one would pass on a closeout
 * that never turned raw mode off — a test that cannot fail for the reason the package is
 * broken. The marker is written by the one call closeout makes, so it can.
 *
 * Skipped on Windows, where `process.kill(process.pid, …)` is an unconditional terminate
 * rather than a real signal delivery.
 */
import { execFileSync } from 'node:child_process';
import { closeSync, mkdtempSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

/** The built entry, because what is under test is what ships. turbo builds before test. */
const distIndex = new URL('../dist/index.js', import.meta.url).href;

const CASE_TIMEOUT_MS = 30_000;
const SIGNAL_AFTER_MS = 80;
const CHILD_GIVE_UP_MS = 5_000;

/** Every token that matters, in the order it was written. Anything else on fd 2 is noise. */
const TOKEN = /\u001B\[\?1049[hl]|\u001B\[\?25[hl]|RAW-(?:ON|OFF)/gu;
const NAMES: Record<string, string> = {
  '\u001B[?1049h': 'enter-alt',
  '\u001B[?1049l': 'leave-alt',
  '\u001B[?25l': 'hide',
  '\u001B[?25h': 'show',
  'RAW-ON': 'raw-on',
  'RAW-OFF': 'raw-off',
};

const ENTERED = ['raw-on', 'enter-alt', 'hide'];
const RESTORED = ['raw-off', 'leave-alt', 'show'];

interface Outcome {
  tokens: string[];
  killedBy: string | null;
  status: number | null;
  stderr: string;
}

/**
 * The child's opening: a terminal it takes over through closeout, the way a full-screen
 * program does — keyboard, screen, cursor — through `install()` so the deadline is the
 * child's to choose.
 *
 * `held` keeps the event loop open, as a live socket or a render timer would, and gives up
 * after five seconds so a broken build cannot hang the suite. Unheld is a program with
 * nothing left to do, which is the one that falls off its own end.
 */
const prelude = ({ deadline = 2_000, held = false }: { deadline?: number; held?: boolean } = {}): string[] => [
  'process.stderr.isTTY = true;',
  'const keys = { isTTY: true, isRaw: false, setRawMode(on) { process.stderr.write(on ? "RAW-ON" : "RAW-OFF"); this.isRaw = on; return this; } };',
  `const { alternateScreen, install, rawMode } = await import(${JSON.stringify(distIndex)});`,
  `const closeout = install({ deadline: ${String(deadline)} });`,
  'rawMode(keys, closeout);',
  'alternateScreen(process.stderr, closeout);',
  'closeout.hideCursor(process.stderr);',
  held ? `setTimeout(() => process.exit(0), ${String(CHILD_GIVE_UP_MS)});` : '',
];

function runChild(lines: string[]): Outcome {
  const dir = mkdtempSync(join(tmpdir(), 'closeout-restore-'));
  const log = join(dir, 'fd2');
  const child = join(dir, 'child.mjs');
  writeFileSync(child, lines.join('\n'));

  const fd = openSync(log, 'w');
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

  const stderr = readFileSync(log, 'utf8');
  return { tokens: [...stderr.matchAll(TOKEN)].map(([token]) => NAMES[token] ?? token), killedBy, status, stderr };
}

describe.skipIf(process.platform === 'win32')('the terminal a real process leaves behind (R4)', () => {
  it(
    'falling off the end of the program',
    () => {
      const observed = runChild(prelude());

      expect(observed.tokens).toEqual([...ENTERED, ...RESTORED]);
      expect(observed.status).toBe(0);
    },
    CASE_TIMEOUT_MS,
  );

  it(
    'process.exit(3) from the middle of the program',
    () => {
      const observed = runChild([...prelude(), 'process.exit(3);']);

      expect(observed.tokens).toEqual([...ENTERED, ...RESTORED]);
      expect(observed.status, 'and the code is still the program’s').toBe(3);
    },
    CASE_TIMEOUT_MS,
  );

  it(
    'an uncaught throw',
    () => {
      const observed = runChild([...prelude(), "setTimeout(() => { throw new Error('mid-render'); }, 20);"]);

      expect(observed.tokens).toEqual([...ENTERED, ...RESTORED]);
      expect(observed.status).toBe(1);
      expect(observed.stderr).toContain('mid-render');
    },
    CASE_TIMEOUT_MS,
  );

  it(
    'a cleanup handler that throws',
    () => {
      const observed = runChild([
        ...prelude({ held: true }),
        "closeout.onExit(() => { throw new Error('the lock file was already gone'); }, 'flush');",
        `setTimeout(() => process.kill(process.pid, 'SIGTERM'), ${String(SIGNAL_AFTER_MS)});`,
      ]);

      expect(observed.tokens).toEqual([...ENTERED, ...RESTORED]);
      expect(observed.killedBy).toBe('SIGTERM');
      expect(observed.stderr).toContain('the lock file was already gone');
    },
    CASE_TIMEOUT_MS,
  );

  it(
    'a deadline that fired, with a handler that never returns',
    () => {
      // Held open, as the socket that will not close would hold it: the deadline really
      // fires, and the restore is run past it.
      const observed = runChild([
        ...prelude({ deadline: 100, held: true }),
        "closeout.onExit(() => new Promise(() => {}), { phase: 'flush', label: 'the-socket-that-will-not-close' });",
        `setTimeout(() => process.kill(process.pid, 'SIGINT'), ${String(SIGNAL_AFTER_MS)});`,
      ]);

      expect(observed.tokens).toEqual([...ENTERED, ...RESTORED]);
      expect(observed.killedBy).toBe('SIGINT');
      expect(observed.stderr).toContain('the-socket-that-will-not-close');
    },
    CASE_TIMEOUT_MS,
  );

  /**
   * The hang that holds nothing: a handler awaiting an event that will never come, in a
   * program with no other work. The deadline's timer is `unref`'d, so the loop drains
   * before it fires and Node leaves through `'exit'` while the shutdown is still waiting on
   * `flush`. Found by this file: on the first build of it the terminal was never restored
   * on this path at all — `runSync` saw a shutdown already started and did nothing, and the
   * `restore` phase the run had not reached was never invoked.
   *
   * How the process *leaves* on this path is not asserted here: it is R1/R10's question,
   * and it is recorded as open in the design rather than pinned by a test.
   */
  it(
    'a hang that holds nothing, so Node leaves before the deadline',
    () => {
      const observed = runChild([
        ...prelude(),
        "closeout.onExit(() => new Promise(() => {}), { phase: 'flush', label: 'waits-on-nothing' });",
        `setTimeout(() => process.kill(process.pid, 'SIGTERM'), ${String(SIGNAL_AFTER_MS)});`,
      ]);

      expect(observed.tokens).toEqual([...ENTERED, ...RESTORED]);
    },
    CASE_TIMEOUT_MS,
  );

  it.each(['SIGINT', 'SIGTERM', 'SIGHUP'])(
    '%s',
    (signal) => {
      const observed = runChild([...prelude({ held: true }), `setTimeout(() => process.kill(process.pid, '${signal}'), ${String(SIGNAL_AFTER_MS)});`]);

      expect(observed.tokens).toEqual([...ENTERED, ...RESTORED]);
      expect(observed.killedBy, 'and the process still dies of the signal').toBe(signal);
    },
    CASE_TIMEOUT_MS,
  );
});
