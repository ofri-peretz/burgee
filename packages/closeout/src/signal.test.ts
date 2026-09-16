/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * How the process **died**, which is the one thing this package's own suites never asked.
 *
 * `install.test.ts` drives a fake process and reads `proc.exited`; `cursor.test.ts` reads a
 * recorder. Both are in-process, so both can only ever see the exit *code* — and a code is
 * exactly what a signalled process is not supposed to have. A program killed by SIGINT does
 * not exit 130; it dies of SIGINT, `WIFSIGNALED` is true, and a shell prints `^C` and
 * reports 130 *on its own*. The difference is invisible to a caller that only reads
 * `$?` and decisive for everything else: `make` stops a parallel build on a signalled
 * child and keeps going on an exit code, a CI runner marks a cancelled job cancelled
 * rather than failed, and a supervisor decides whether to restart.
 *
 * closeout graded 21 / 21 on `exit-hook`'s suite and 6 / 6 on `restore-cursor`'s while
 * `leaveAfter` called `process.exit(130)`, because neither incumbent suite kills a process
 * either. So the assertion lives here, on real children that are really signalled, and it
 * reads `killedBy` — node's `error.signal`, which is `WIFSIGNALED` seen from the parent.
 *
 * The model is `flagstaff/src/ora.test.ts`, which grades the same property on the
 * hand-rolled copy of this machinery that flagstaff carries because closeout could not
 * serve it.
 *
 * Skipped on Windows, where `process.kill(process.pid, …)` is an unconditional terminate
 * rather than a real signal delivery, so the assertion would grade node's emulation rather
 * than this file.
 */
import { execFileSync } from 'node:child_process';
import { closeSync, mkdtempSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

const HIDE_CURSOR = '[?25l';
const SHOW_CURSOR = '[?25h';

/**
 * The **built** entries, because what is under test is what ships — and because `dist/` is
 * where the comment stripper and the `exports` map have both had their say. turbo's
 * `test → build` dependency guarantees they exist.
 */
const distIndex = new URL('../dist/index.js', import.meta.url).href;
const distExitHook = new URL('../dist/exit-hook.js', import.meta.url).href;

/** How long the child waits before signalling itself, and how long before it gives up. */
const SIGNAL_AFTER_MS = 80;
const CHILD_GIVE_UP_MS = 5_000;
const CASE_TIMEOUT_MS = 30_000;
/** The code a child leaves with when its *own* handler decided, so the two are tellable apart. */
const OWN_EXIT_CODE = 7;

interface Outcome {
  /** How many times the cursor was hidden and shown, off the child's fd 2. */
  hide: number;
  show: number;
  /** The signal that killed it, or `null` when it exited of its own accord. */
  killedBy: string | null;
  /** The code it exited with, or `null` when a signal killed it. */
  status: number | null;
  /** How many times the child's own signal handler ran, where one was installed. */
  ownHandlerRuns: number;
  /** Whether a hook registered through `closeout/exit-hook` ran at all. */
  hookRuns: number;
}

/**
 * Run one child to its death and report how it went.
 *
 * fd 2 is handed to the child already pointing at a file: writes to a file descriptor are
 * synchronous in node, so nothing queued is lost when the process is terminated outright —
 * which is the whole hazard a buffered pipe would introduce into an assertion about bytes.
 *
 * `execFileSync` throws for every case here, since the point is that the child does not
 * exit 0. The throw carries `.status` and `.signal`, and those two *are* the result.
 */
function runChild(source: string): Outcome {
  const dir = mkdtempSync(join(tmpdir(), 'closeout-signal-'));
  const log = join(dir, 'fd2');
  const child = join(dir, 'child.mjs');
  writeFileSync(child, source);

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

  const written = readFileSync(log, 'utf8');
  const count = (needle: string): number => written.split(needle).length - 1;
  return {
    hide: count(HIDE_CURSOR),
    show: count(SHOW_CURSOR),
    killedBy,
    status,
    ownHandlerRuns: count('OWN-HANDLER-RAN'),
    hookRuns: count('HOOK-RAN'),
  };
}

/** A child that hides the cursor through closeout's own API, then signals itself. */
function closeoutChild(signal: string, ownHandler = false): Outcome {
  return runChild(
    [
      'process.stderr.isTTY = true;',
      // A program that took the signal over itself must survive: a library that ran some
      // cleanup does not get to overrule it. The marker is written on every entry, because
      // the failure the guard prevents is the handler being delivered **twice** for one
      // Ctrl-C — once by node, once by an unconditional re-raise.
      ownHandler
        ? `let n = 0; process.on('${signal}', () => { process.stderr.write('OWN-HANDLER-RAN'); if (++n === 1) setTimeout(() => process.exit(${OWN_EXIT_CODE}), 300); });`
        : '',
      `const { hideCursor } = await import(${JSON.stringify(distIndex)});`,
      'hideCursor(process.stderr);',
      `setTimeout(() => process.kill(process.pid, '${signal}'), ${SIGNAL_AFTER_MS});`,
      `setTimeout(() => process.exit(0), ${CHILD_GIVE_UP_MS});`,
    ].join('\n'),
  );
}

/** A child that registers a hook through the `exit-hook` drop-in, then signals itself. */
function exitHookChild(signal: string): Outcome {
  return runChild(
    [
      'process.stderr.isTTY = true;',
      `const { default: exitHook } = await import(${JSON.stringify(distExitHook)});`,
      "exitHook(() => { process.stderr.write('HOOK-RAN'); });",
      `setTimeout(() => process.kill(process.pid, '${signal}'), ${SIGNAL_AFTER_MS});`,
      `setTimeout(() => process.exit(0), ${CHILD_GIVE_UP_MS});`,
    ].join('\n'),
  );
}

describe.skipIf(process.platform === 'win32')('a signal that nobody else claimed still kills the process', () => {
  /**
   * The four signals `install()` listens for that a POSIX box can actually deliver.
   * `SIGBREAK` is Windows-only and its listener can never fire here, which is a property of
   * the platform rather than of this package.
   *
   * SIGQUIT is in the list on purpose: it is the one whose default action differs (terminate
   * *and* dump core), so a re-raise that quietly normalised every signal to the same
   * disposition would show up here and nowhere else.
   */
  it.each(['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGQUIT'])(
    '%s: the cursor comes back and the process dies of the signal, not of an exit code',
    (signal) => {
      const observed = closeoutChild(signal);

      expect(observed.hide, 'the cursor was hidden once').toBe(1);
      expect(observed.show, 'and handed back exactly once').toBe(1);
      // The line this file exists for. `killedBy` is `WIFSIGNALED` seen from the parent:
      // on the unfixed state it is null and `status` is 128 + n, which is a process that
      // *reported* the signal rather than one that died of it.
      expect(observed.killedBy, 'a signalled process must die of the signal').toBe(signal);
      expect(observed.status, 'a signalled process has no exit code at all').toBeNull();
    },
    CASE_TIMEOUT_MS,
  );

  /**
   * The guard, which the re-raise must not cost.
   *
   * Removing our listener *before* counting is what makes re-raising safe — it is the half
   * `signal-exit` spells `this.unload()` and the half closeout already had. Deleting the
   * count check would not show up as a second death here: the child would still exit 7,
   * because an unconditional re-raise is caught by the child's own handler rather than by
   * node's default action. What changes is that one Ctrl-C is delivered to the program
   * **twice**, so `ownHandlerRuns` is the assertion that grades the guard and the other
   * three do not.
   */
  it(
    'stands down for a program that installed its own handler, and delivers it once',
    () => {
      const observed = closeoutChild('SIGINT', true);

      expect(observed.ownHandlerRuns, 'one Ctrl-C, one delivery').toBe(1);
      expect(observed.show, 'cleanup still runs — that is not what is being deferred').toBe(1);
      expect(observed.killedBy, 'the program owns the signal, so nothing re-raises it').toBeNull();
      expect(observed.status, 'and the program decides the code').toBe(OWN_EXIT_CODE);
    },
    CASE_TIMEOUT_MS,
  );
});

/**
 * The drop-in's deliberate gap, pinned so that nobody closes it by accident.
 *
 * `closeout/exit-hook` listens on `beforeExit`, `SIGINT`, `SIGTERM`, `exit` and `message`,
 * and on **SIGHUP** it registers nothing. That is not an oversight: `exit-hook@5.1.0`'s own
 * `addHook` registers exactly those five and no more (vendored at
 * `packages/compat-oracle/vendor/exit-hook/node_modules/exit-hook/index.js`, lines 121-138),
 * and a drop-in that handles a signal the incumbent leaves alone changes the behaviour of
 * every program that swapped it in. A terminal closing would start running hooks that never
 * ran before, and the program's SIGHUP disposition would change from "die" to "die later".
 *
 * So the façade stays faithful and closeout's own `onExit` carries SIGHUP — which the suite
 * above asserts on a real SIGHUP. The README's advice, and flagstaff's, is to use the
 * package's own API rather than the drop-in when the terminal closing matters.
 */
describe.skipIf(process.platform === 'win32')('closeout/exit-hook keeps the incumbent’s signal list', () => {
  it(
    'SIGINT runs the hook and leaves with 130, because that is what exit-hook does',
    () => {
      const observed = exitHookChild('SIGINT');

      expect(observed.hookRuns, 'the incumbent runs hooks on SIGINT').toBe(1);
      // Not a re-raise. `exit-hook`'s contract is `process.exit(128 + signal)` and its own
      // suite grades the number, so the façade exits where `install()` raises.
      expect(observed.status).toBe(130);
      expect(observed.killedBy).toBeNull();
    },
    CASE_TIMEOUT_MS,
  );

  it(
    'SIGHUP runs no hook and is left to node, exactly as the incumbent leaves it',
    () => {
      const observed = exitHookChild('SIGHUP');

      expect(observed.hookRuns, 'upstream registers no SIGHUP listener, so neither do we').toBe(0);
      expect(observed.killedBy, 'and with no listener the signal does what it always did').toBe('SIGHUP');
    },
    CASE_TIMEOUT_MS,
  );
});
