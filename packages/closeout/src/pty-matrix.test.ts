/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Design R4, and controlroom's criterion 4: the restore matrix through a **real terminal**. Every
 * exit path controlroom's constraint 3 names — falling off the end, an uncaught throw, `SIGINT`,
 * `SIGTERM`, `SIGHUP`, a `process.exit()` elsewhere, and the deadline — crossed with the three
 * things a full-screen program takes from a terminal: the cursor, raw mode, the alternate screen.
 *
 * ## What a pty adds to `terminal-restore.test.ts`
 *
 * That file spawns real children and reads real bytes, but the "terminal" there is a file on
 * fd 2 and the keyboard is an object whose `setRawMode` writes a marker. So it grades the call
 * closeout makes and never the terminal it makes it on. Here each child runs on a pseudo-terminal
 * from `scripts/pty-host.py`: its `process.stdin` and `process.stdout` are real ttys, `setRawMode`
 * changes the line discipline for real, and the sequences arrive at the master side as a terminal
 * emulator would read them.
 *
 * ## How raw mode is observed, rather than reported
 *
 * Node resets its own stdio's terminal mode as it exits (`ResetStdio`), which is why
 * `terminal-restore.test.ts` says a raw-mode assertion made after the exit cannot fail. So the
 * terminal is asked **during** the exit, before that reset: the child registers one more
 * `restore` handler, after the three under test, that runs `stty -a` on the terminal itself —
 * the kernel's own record of the line discipline, not Node's `isRaw` — and prints `RAW` if it
 * finds `-icanon`, `COOKED` otherwise. Handlers in one phase run in registration order, so the
 * probe sees the terminal exactly as closeout's restore left it. The same probe, run once while
 * the program holds the terminal, prints `HELD-RAW`, which proves the probe can see raw mode at all.
 *
 * ## Proven to fail on the unfixed state
 *
 * With the `setRawMode(false)` in `rawMode`'s undo removed from the built `dist/cursor.js` — raw
 * mode taken and never given back, the gap closeout's README once listed as "still to come" — all
 * seven rows read `RESTORED-RAW` and go red (measured 2026-10-27). A bare
 * `process.stdin.setRawMode(true)` in the child, with no undo registered, reads the same.
 *
 * POSIX only: Windows' pseudo-console re-renders what a program writes, so the bytes the host
 * reads are the console's and not the program's, and Windows has neither `stty` nor real
 * signals (`terminal-restore.test.ts` says the same of `process.kill`).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/scratch-dir.js';

const scratch = scratchDirs();
const HOST = fileURLToPath(new URL('../../../scripts/pty-host.py', import.meta.url));
/** The built entry, because what is under test is what ships. turbo builds before test. */
const distIndex = new URL('../dist/index.js', import.meta.url).href;

const CASE_TIMEOUT_MS = 30_000;
const SIGNAL_AFTER_MS = 80;
const CHILD_GIVE_UP_MS = 5_000;

/** A Python with `pty`, and a terminal with `stty`: both are the system's, never a dependency (U1). */
function python(): string | undefined {
  if (process.platform === 'win32') return undefined;
  for (const exe of ['python3', 'python']) {
    try {
      execFileSync(exe, ['-c', 'import pty, select, os'], { stdio: 'ignore' });
      return exe;
    } catch {
      continue;
    }
  }
  return undefined;
}
const exe = python();

/** Every token that matters, in the order the terminal received it. */
const TOKEN = /\u001B\[\?1049[hl]|\u001B\[\?25[hl]|STTY-(?:HELD|RESTORED)-(?:RAW|COOKED)/gu;
const NAMES: Record<string, string> = { '\u001B[?1049h': 'enter-alt', '\u001B[?1049l': 'leave-alt', '\u001B[?25l': 'hide', '\u001B[?25h': 'show' };

/** What every row must read: taken, seen raw by the terminal, given back, seen cooked by the terminal. */
const MATRIX = ['enter-alt', 'hide', 'STTY-HELD-RAW', 'leave-alt', 'show', 'STTY-RESTORED-COOKED'];

/**
 * The child: it takes the terminal through closeout the way a full-screen program does, asks the
 * terminal what it did, and registers the second question to run last on whatever path ends it.
 */
const prelude = ({ deadline = 2_000, held = false }: { deadline?: number; held?: boolean } = {}): string[] => [
  "import { execFileSync } from 'node:child_process';",
  `const { alternateScreen, install, rawMode } = await import(${JSON.stringify(distIndex)});`,
  "const probe = (when) => { const s = execFileSync('stty', ['-a'], { stdio: ['inherit', 'pipe', 'pipe'], encoding: 'utf8' }); process.stdout.write('\\nSTTY-' + when + '-' + (/(?:^|\\s)-icanon(?=\\s|$)/mu.test(s) ? 'RAW' : 'COOKED') + '\\n'); };",
  `const closeout = install({ deadline: ${String(deadline)} });`,
  'rawMode(process.stdin, closeout);',
  'alternateScreen(process.stdout, closeout);',
  'closeout.hideCursor(process.stdout);',
  "probe('HELD');",
  "closeout.onExit(() => probe('RESTORED'), 'restore');",
  held ? `setTimeout(() => process.exit(0), ${String(CHILD_GIVE_UP_MS)});` : '',
];

interface Outcome {
  tokens: string[];
  /** The signal the child died of, 0 when it exited. */
  signal: number;
  code: number;
  screen: string;
}

function onTerminal(lines: string[]): Outcome {
  const child = join(scratch('closeout-pty-'), 'child.mjs');
  writeFileSync(child, lines.join('\n'));
  // stdin closed at once: nothing is typed, so the host stops relaying and only drains the screen.
  const { stdout, stderr } = spawnSync(exe as string, [HOST, process.execPath, child], { input: '', encoding: 'utf8', timeout: 25_000, env: { ...process.env, TERM: 'xterm-256color' } });
  const wait = /SIGNAL (\d+) CODE (\d+)/u.exec(stderr);
  return {
    tokens: [...stdout.matchAll(TOKEN)].map(([token]) => NAMES[token] ?? token),
    signal: Number(wait?.[1] ?? Number.NaN),
    code: Number(wait?.[2] ?? Number.NaN),
    screen: stdout,
  };
}

const SIGNAL_NUMBERS = { SIGHUP: 1, SIGINT: 2, SIGTERM: 15 } as const;

describe.skipIf(exe === undefined)('the restore matrix on a real terminal (R4; controlroom criterion 4)', () => {
  it(
    'falling off the end of the program',
    () => {
      const observed = onTerminal(prelude());
      expect(observed.tokens, observed.screen).toEqual(MATRIX);
      expect([observed.signal, observed.code]).toEqual([0, 0]);
    },
    CASE_TIMEOUT_MS,
  );

  it(
    'process.exit(3) from elsewhere in the program',
    () => {
      const observed = onTerminal([...prelude({ held: true }), 'setTimeout(() => process.exit(3), 20);']);
      expect(observed.tokens, observed.screen).toEqual(MATRIX);
      expect([observed.signal, observed.code], 'and the code is still the program’s').toEqual([0, 3]);
    },
    CASE_TIMEOUT_MS,
  );

  it(
    'an uncaught throw',
    () => {
      const observed = onTerminal([...prelude({ held: true }), "setTimeout(() => { throw new Error('mid-render'); }, 20);"]);
      expect(observed.tokens, observed.screen).toEqual(MATRIX);
      expect([observed.signal, observed.code]).toEqual([0, 1]);
      expect(observed.screen).toContain('mid-render');
    },
    CASE_TIMEOUT_MS,
  );

  it.each(['SIGINT', 'SIGTERM', 'SIGHUP'] as const)(
    '%s',
    (signal) => {
      const observed = onTerminal([...prelude({ held: true }), `setTimeout(() => process.kill(process.pid, '${signal}'), ${String(SIGNAL_AFTER_MS)});`]);
      expect(observed.tokens, observed.screen).toEqual(MATRIX);
      expect(observed.signal, 'and the process still dies of the signal').toBe(SIGNAL_NUMBERS[signal]);
    },
    CASE_TIMEOUT_MS,
  );

  it(
    'the deadline, past a handler that never returns',
    () => {
      const observed = onTerminal([
        ...prelude({ deadline: 100, held: true }),
        "closeout.onExit(() => new Promise(() => {}), { phase: 'flush', label: 'the-socket-that-will-not-close' });",
        `setTimeout(() => process.kill(process.pid, 'SIGTERM'), ${String(SIGNAL_AFTER_MS)});`,
      ]);
      expect(observed.tokens, observed.screen).toEqual(MATRIX);
      expect(observed.signal).toBe(SIGNAL_NUMBERS.SIGTERM);
      expect(observed.screen).toContain('the-socket-that-will-not-close');
    },
    CASE_TIMEOUT_MS,
  );
});
