/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The matrix — design R1, R2, R10, and the check the design names as the one that would have
 * caught the original problem.
 *
 * *"The original problem is a subprocess that never returns and takes an unattended run with
 * it. The matrix includes a child that ignores `SIGTERM` and never exits; the cell asserts
 * the parent settles within `timeout` + grace, that `timedOut` is true, and that output
 * written before the kill is present."*
 *
 * ## The deadline cells stopped measuring the runner
 *
 * That cell used to hand `run()` a 300 ms deadline and assert `SIGKILL` came back. It went
 * red on macOS CI with `expected 'SIGTERM' to be 'SIGKILL'`, and the escalation was not at
 * fault: **300 ms was a budget for `node`'s cold start, not for the ladder.** The stubborn
 * child installs its `SIGTERM` handler on its first executed line, so until it has booted
 * there is no handler, the deadline's first rung kills it by the platform's *default* action,
 * and the run truthfully reports `SIGTERM` with no output. Driving `run()` at deadlines of
 * 1 / 5 / 20 ms reproduces it every time; at 300 ms and 2,000 ms the escalation fires every
 * time. On an idle Mac one cold start in twelve took **265 ms**, so a 300 ms deadline was
 * about a one-in-twelve coin.
 *
 * Raising the number is the move `packages/burgee/src/yargs/cliui.test.ts` has now failed
 * three times: *"a millisecond budget is a statement about the runner"*. So two changes
 * instead, mirroring what that file settled on:
 *
 *  1. **The escalation is proven without a clock at all** — `the kill ladder` below drives
 *     `startDeadline` on fake timers against a `Killable` that records what it was sent, and
 *     asserts which signal arrives at which tick. No process, no scheduler, no flake.
 *  2. **The end-to-end cells calibrate against this runner** instead of assuming it. A cold
 *     start is measured here, now, and the deadline is a multiple of it. The *maximum* of the
 *     samples is used and not the median, for the reason `cliui.test.ts` gives one level over:
 *     interference can only ever make a reading slower, so noise is one-sided, and for a
 *     budget the maximum is the estimator it cannot deflate.
 *
 * Each such cell also asserts the child's own output *before* it asserts which rung ended it.
 * That line is written immediately after the handler is installed, so its presence is proof
 * the child was armed — and without that proof the cell is reading the runner rather than the
 * ladder, which is the failure above wearing a different assertion.
 *
 * ## `PATH` is assembled for this platform
 *
 * The runtime says `platform: process.platform`, so on Windows it is a Windows runtime — and
 * the fixture `PATH` was still being joined with `:`. `pathDelimiter` reads `;` there, so the
 * whole string arrived as one entry and nothing resolved. `node:path`'s own `delimiter` is
 * the value that agrees with the platform the runtime is describing.
 */
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { format, toEvent, toJson } from './project.js';
import { DEFAULT_TIMEOUT, run, startDeadline, type ExitHost, type Killable, type Result } from './run.js';
import { type Runtime } from './runtime.js';
import { NotFoundError } from './which.js';

const WINDOWS = process.platform === 'win32';

let dir: string;
let runtime: Runtime;

/** A fixture script, written executable, so resolution has something real to find. */
function fixture(name: string, body: string): string {
  const at = join(dir, name);
  writeFileSync(at, `#!/usr/bin/env node\n${body}\n`);
  chmodSync(at, 0o755);
  return at;
}

/**
 * `process.env` with `dir` in front of `PATH`, under whichever case this platform spells it.
 *
 * Spreading `process.env` and then setting `PATH` would leave **both** `Path` and `PATH` in
 * the object on Windows, where the environment is case-insensitive but a JavaScript object is
 * not. `pathKey` would read ours and the spawned child might inherit the other; which of two
 * keys differing only in case reaches a Windows child is not something to leave to chance in
 * the package whose job is `PATH`.
 */
function envWithPathPrefix(prefix: string): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(process.env)) if (key.toUpperCase() !== 'PATH') env[key] = value;
  // `process.env` is case-insensitive on Windows, so this reads `Path` there without asking.
  env[WINDOWS ? 'Path' : 'PATH'] = `${prefix}${delimiter}${process.env['PATH'] ?? ''}`;
  return env;
}

/**
 * The cost of one cold `node` child on this runner, measured rather than assumed.
 *
 * Used as the unit for every deadline below, so the budget describes the ladder and the
 * runner cancels out. See this file's header for why it is the maximum of the samples.
 */
let coldStartMs = 0;

/** A deadline long enough that the child is certainly armed, expressed in cold starts. */
const budget = (): number => Math.max(500, coldStartMs * 4);

/**
 * A fixture that outlives its suite is a bug in the suite, not a detail of the fixture.
 *
 * Both long-lived fixtures below are pinned open by a `setInterval` and one of them declines
 * `SIGTERM` on purpose, so the only thing that ends them is the parent's ladder — and a parent
 * that is killed never gets there. A minute is far longer than any case here (the deadlines are
 * in the hundreds of milliseconds) and far shorter than "until the machine is rebooted".
 */
const SELF_LIMIT = "setTimeout(() => process.exit(0), 60_000);";

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'bellpull-matrix-'));
  runtime = { platform: process.platform, env: envWithPathPrefix(dir), cwd: dir, uid: process.getuid?.(), gid: process.getgid?.() };

  fixture('say-hello', "process.stdout.write('hello');");
  fixture('exit-25', "process.stdout.write('before'); process.exit(25);");
  fixture('to-stderr', "process.stderr.write('problem'); process.exit(3);");
  fixture('echo-argv', 'process.stdout.write(JSON.stringify(process.argv.slice(2)));');
  // Writes, flushes, then ignores SIGTERM forever. The control case for R2.
  //
  // `SELF_LIMIT` is what stops "forever" from meaning it. The ladder SIGKILLs this child
  // 300 ms in, so nothing here ever reaches a minute — but the ladder's second rung is a
  // timer in the *parent*, and a parent that dies first never fires it. When a hook in this
  // file timed out, vitest tore the worker down mid-run and left a `stubborn` behind:
  // SIGTERM-ignoring, `setInterval`-pinned, spinning until the machine is rebooted. That is
  // a leak that pays for itself in the wrong direction — one timeout leaves a process that
  // makes the next timeout likelier — and it is why this suite read as "load-sensitive"
  // (D-091) and got worse over a long session rather than flaking at random. Found with a
  // `pgrep`: one survivor, and its temp directory already deleted out from under it.
  fixture(
    'stubborn',
    `${SELF_LIMIT}
process.on('SIGTERM', () => {});
process.stdout.write('partial output\\n');
setInterval(() => {}, 1000);`,
  );
  // Leaves politely on SIGTERM, so the ladder's first rung is enough.
  fixture(
    'polite',
    `${SELF_LIMIT}
process.stdout.write('starting\\n');
process.on('SIGTERM', () => process.exit(0));
setInterval(() => {}, 1000);`,
  );

  const samples: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    const at = Date.now();
    // eslint-disable-next-line reliability/no-await-in-loop -- four cold starts, and they are the measurement: run concurrently they would time each other rather than the runner
    await run('say-hello', [], { runtime, timeout: 0 });
    samples.push(Date.now() - at);
  }
  coldStartMs = Math.max(...samples);
}, 60_000);

// 60 s like everything else here that touches the filesystem under this suite's own load.
afterAll(() => rmSync(dir, { recursive: true, force: true }), 60_000);

describe('a result, not a string and a thrown error (R1)', () => {
  it('resolves on success with the output and the resolved executable', async () => {
    const result = await run('say-hello', [], { runtime });
    expect(result.ok).toBe(true);
    expect(result.code).toBe(0);
    expect(result.signal).toBeNull();
    expect(result.stdout).toBe('hello');
    expect(result.executable).toEqual({ path: join(dir, 'say-hello'), from: dir });
  });

  it('resolves on a non-zero exit — the case execa throws for', async () => {
    const result = await run('exit-25', [], { runtime });
    expect(result.ok).toBe(false);
    expect(result.code).toBe(25);
    // Output written before the failure is still output. A throw loses it unless the
    // caller remembers to dig it off the error.
    expect(result.stdout).toBe('before');
    expect(result.timedOut).toBe(false);
  });

  it('keeps stderr separate from stdout', async () => {
    const result = await run('to-stderr', [], { runtime });
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('problem');
    expect(result.code).toBe(3);
  });

  it('passes arguments through as an argv array, so nothing in one is interpreted', async () => {
    const hostile = ['a b', 'a & calc', '$(calc)', '`calc`', 'a"b', "it's", '*', ''];
    const result = await run('echo-argv', hostile, { runtime });
    expect(JSON.parse(result.stdout)).toEqual(hostile);
  });

  it('rejects when the executable does not resolve — no process ran, so there is no result', async () => {
    await expect(run('nosuchcommandanywhere', [], { runtime })).rejects.toThrow(NotFoundError);
  });

  it('does not mutate the caller’s arguments', async () => {
    const args = ['x'];
    await run('echo-argv', args, { runtime });
    expect(args).toEqual(['x']);
  });
});

/** `ChildProcess.kill`'s surface, and nothing else — a recorder for what the ladder sends. */
const recorder = (): Killable & { sent: string[] } => {
  const sent: string[] = [];
  return { sent, kill: (signal) => sent.push(signal ?? 'SIGTERM') };
};

/**
 * The ladder itself, with nothing that can be slow.
 *
 * This is where "a child that ignores `SIGTERM` gets `SIGKILL`" is actually *proven*. The
 * end-to-end cell below can only observe the outcome of a race it does not control; this one
 * controls the clock, so it can assert which signal is sent at which tick and that nothing is
 * sent before. Deleting the second rung from `startDeadline` turns `escalates to SIGKILL`
 * red, which is the check the fix is required to have.
 */
describe('the kill ladder (R2, Y10), with no process and no clock', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('sends nothing before the deadline, and SIGTERM exactly on it', () => {
    const child = recorder();
    const deadline = startDeadline(child, 300, 300);

    vi.advanceTimersByTime(299);
    expect(child.sent, 'a deadline that fires early is a deadline that is not the deadline').toEqual([]);
    expect(deadline.fired()).toBe(false);

    vi.advanceTimersByTime(1);
    expect(child.sent).toEqual(['SIGTERM']);
    expect(deadline.fired()).toBe(true);
  });

  it('escalates to SIGKILL once grace has passed — the rung a child that traps SIGTERM needs', () => {
    const child = recorder();
    startDeadline(child, 300, 300);

    vi.advanceTimersByTime(300 + 299);
    expect(child.sent, 'SIGKILL before grace is up denies a well-behaved child its chance to clean up').toEqual(['SIGTERM']);

    vi.advanceTimersByTime(1);
    expect(child.sent).toEqual(['SIGTERM', 'SIGKILL']);
  });

  it('stands both rungs down when the child settles on its own', () => {
    const child = recorder();
    startDeadline(child, 300, 300).cancel();
    vi.advanceTimersByTime(60_000);
    expect(child.sent).toEqual([]);
  });

  it('cancelling after the first rung still stops the second', () => {
    const child = recorder();
    const deadline = startDeadline(child, 300, 300);
    vi.advanceTimersByTime(300);
    deadline.cancel();
    vi.advanceTimersByTime(60_000);
    expect(child.sent).toEqual(['SIGTERM']);
  });

  it('timeout: 0 arms nothing at all, for a caller who means it', () => {
    const child = recorder();
    const deadline = startDeadline(child, 0, 300);
    vi.advanceTimersByTime(60_000);
    expect(child.sent).toEqual([]);
    expect(deadline.fired()).toBe(false);
  });
});

describe('the deadline, end to end (R2, Y10)', () => {
  it('is finite by default, because a run that never returns strands an unattended agent', () => {
    expect(Number.isFinite(DEFAULT_TIMEOUT)).toBe(true);
    expect(DEFAULT_TIMEOUT).toBeGreaterThan(0);
  });

  it(
    'SIGTERM is enough for a child that leaves when asked',
    async () => {
      const result = await run('polite', [], { runtime, timeout: budget(), grace: 30_000 });

      expect(result.stdout, 'the child never started — this cell measured the runner, not the first rung').toContain('starting');
      expect(result.timedOut).toBe(true);
      expect(result.ok).toBe(false);
      if (WINDOWS) {
        // Windows has no deliverable SIGTERM: `subprocess.kill` maps it to `TerminateProcess`
        // and the child is "killed forcefully and abruptly" (Node's own words), so the
        // handler that would have called `process.exit(0)` never runs. The first rung still
        // ends it, which is this cell's claim — it just ends it from outside.
        expect(result.signal).toBe('SIGTERM');
        expect(result.code).toBeNull();
      } else {
        // It caught the signal and left under its own power, so there is an exit code and no
        // signal. `ok` is still false: the deadline fired, and a run that was cut short did
        // not succeed.
        expect(result.signal).toBeNull();
        expect(result.code).toBe(0);
      }
    },
    60_000,
  );

  /**
   * The cell the design names. Without the second rung of the ladder this hangs on POSIX
   * until vitest's own timeout kills the whole file — which is exactly the failure being
   * prevented, arriving one level up.
   */
  it(
    'ignores SIGTERM: the parent still settles, timedOut is true, and the partial output survives',
    async () => {
      const timeout = budget();
      const grace = 300;
      const started = Date.now();
      const result = await run('stubborn', [], { runtime, timeout, grace });
      const elapsed = Date.now() - started;

      // First, because everything after it depends on the child having been armed: this line
      // is written on the statement after `process.on('SIGTERM', …)`, so its presence is the
      // proof. It is also R2's whole content — a CI timeout with the output discarded is
      // undiagnosable.
      expect(result.stdout, `the child had not armed within ${timeout}ms — this cell measured node's cold start, not the ladder`).toContain('partial output');
      expect(result.timedOut).toBe(true);
      expect(result.ok).toBe(false);
      // Killed, so there is a signal and no exit code — the shape Node reports and the shape
      // commander's executable-subcommand path maps to 1.
      expect(result.code).toBeNull();
      // On Windows a child cannot decline to die: the first rung is `TerminateProcess` and
      // the trap above never runs, so the second rung is never reached. The escalation that
      // POSIX needs here is proven on both platforms by `the kill ladder` above, which does
      // not depend on a child being able to refuse.
      expect(result.signal).toBe(WINDOWS ? 'SIGTERM' : 'SIGKILL');
      // Settled inside the budget it was given, with room for scheduling.
      expect(elapsed).toBeLessThan(timeout + grace + 10_000);
    },
    60_000,
  );

  it('timeout: 0 opts out, for a caller who means it', async () => {
    const result = await run('say-hello', [], { runtime, timeout: 0 });
    expect(result.ok).toBe(true);
    expect(result.timedOut).toBe(false);
  });
});

/**
 * The `bellpull → closeout` seam (see `RunOptions.exitHost`).
 *
 * Declared structurally rather than imported, because `package-shape-lock.test.ts` asserts a
 * foundation package depends on nothing — so the test builds a host with `closeout`'s own
 * `Registry.add` signature and checks that a real `closeout` registry would fit it.
 */
/** `closeout`'s `Registry.add(handler, spec?) => () => void`, to the letter. */
function fakeCloseout(): ExitHost & { fire: () => void; size: () => number } {
  const handlers = new Set<() => unknown>();
  return {
    add(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    fire() {
      for (const handler of handlers) handler();
    },
    size: () => handlers.size,
  };
}

describe('a spawned child is not orphaned when the parent shuts down', () => {
  it('registers nothing when no host is given — this package does not claim the process’s signals', async () => {
    const host = fakeCloseout();
    await run('say-hello', [], { runtime });
    expect(host.size()).toBe(0);
  });

  it(
    'kills the child when the host fires, and the run comes back rather than hanging',
    async () => {
      const host = fakeCloseout();
      const pending = run('polite', [], { runtime, exitHost: host, timeout: 0 });
      // Registration is synchronous — `run` reaches `exitHost.add` before its first `await` —
      // so there is nothing to wait for here, and waiting a fixed number of milliseconds for
      // it would be one more clock this file does not need.
      expect(host.size()).toBe(1);

      host.fire();
      const result = await pending;
      // SIGKILL is not catchable anywhere, and on Windows every signal is a forceful
      // termination, so this needs no arming and no platform split.
      expect(result.signal).toBe('SIGKILL');
      expect(result.ok).toBe(false);
    },
    60_000,
  );

  it('unregisters when the child is done, so a long-lived host does not accumulate handlers', async () => {
    const host = fakeCloseout();
    await run('say-hello', [], { runtime, exitHost: host });
    expect(host.size()).toBe(0);
  });
});

describe('one result, three renderings (R5, Y5)', () => {
  let result: Result;
  // 60 s, like every other hook and case in this file that spawns a real child. It is the one
  // that did not have it, and the difference was invisible until the machine was busy: vitest's
  // default hook budget is 10 s, a cold `node` on an idle box is ~32 ms, and under sixteen
  // concurrent turbo tasks it is ~278 ms and climbing. This hook then failed the whole
  // `bellpull` suite from inside `ci:local` and the pre-push hook, with a message naming a
  // `describe` two hundred lines away — which is why it read as the load-sensitive flake of
  // D-091 rather than as the thing it is: one spawn budgeted as if it were arithmetic.
  beforeAll(async () => {
    result = await run('exit-25', [], { runtime });
  }, 60_000);

  it('the human form names the failure and where the binary came from', () => {
    const text = format(result);
    expect(text).toContain('failed');
    expect(text).toContain('exit-25');
    expect(text).toContain('25');
    expect(text).toContain(join(dir, 'exit-25'));
  });

  it('the JSON envelope carries the same facts, and no others', () => {
    const json = toJson(result);
    expect(json['ok']).toBe(false);
    expect(json['code']).toBe(25);
    expect(json['stdout']).toBe('before');
    expect((json['executable'] as { from: string }).from).toBe(dir);
  });

  it('the agent event collapses the outcome to one word, so four consumers cannot disagree', () => {
    expect(toEvent(result).outcome).toBe('failed');
  });

  it('every rendering comes from one value — none of them can report something the others cannot', () => {
    // The contract that makes a `--json` flag trustworthy: nothing is computed in one
    // projection that is absent from the record.
    const json = toJson(result);
    const event = toEvent(result);
    expect(json['code']).toBe(event.code);
    expect(json['command']).toBe(event.command);
    expect(json['durationMs']).toBe(event.durationMs);
  });

  it(
    'distinguishes a timeout from an ordinary failure in all three',
    async () => {
      // The same calibrated budget, for the same reason: what is asserted here is true
      // whichever rung ended the child, but a cell that spawns a real child and hands it a
      // number picked off one machine is the instrument this file just finished replacing.
      const timed = await run('stubborn', [], { runtime, timeout: budget(), grace: 300 });
      expect(format(timed)).toContain('timed out');
      expect(toJson(timed)['timedOut']).toBe(true);
      expect(toEvent(timed).outcome).toBe('timedOut');
    },
    60_000,
  );
});
