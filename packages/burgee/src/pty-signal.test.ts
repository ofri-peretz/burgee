/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * PLAN 2.5.4 — Ctrl+C, pressed at a **real terminal**, on the path burgee actually ships.
 *
 * ## The signal path differs from a written byte, and that is the whole step
 *
 * `shutdown.test.ts` next door grades E5 and O5 against a `ProcessLike` that records:
 * `proc.raise('SIGINT')` is a function call, and the "signal" never leaves the test process.
 * That is the right shape for grading *which handlers run in which phase* and it is wrong for
 * the one question a person asks — "I pressed Ctrl+C; did my terminal come back?" — because in
 * between the key and the handler sits a piece of software neither test has: the **tty line
 * discipline**.
 *
 * Press Ctrl+C at a terminal in canonical mode and the driver's `ISIG` turns the `0x03` into a
 * `SIGINT` delivered to the foreground process group. Put the same terminal in **raw** mode and
 * `ISIG` is off: the identical keystroke arrives as a byte on stdin and no signal is raised at
 * all. A test that writes `\x03` to a pipe is therefore grading the raw-mode path whatever it
 * believes it is grading, and it passes on code whose signal path is broken.
 *
 * This repository has already paid for that distinction. `caique/src/raw.test.ts` says it in
 * its own words — *"Ctrl-C typed at a terminal in raw mode arrives as a byte, `keyOf` reads it
 * as `cancel`, and the loop restores … and it passes on the broken code"* — and caique shipped
 * a prompt that restored the cursor on a cancel and never on a signal, with a green suite.
 *
 * So: a real pty, a real keystroke, a real signal, and burgee's built `dist/shutdown.js` on
 * the other end of it.
 *
 * ## The pty comes from the system, not from a dependency
 *
 * Node cannot open a pty. There is no binding for `openpty`/`posix_openpt`; `tty.ReadStream`
 * wraps an fd that is already a terminal and cannot create one. Every npm answer
 * (`node-pty`) is a **native addon**, and U1 is zero external dependencies.
 *
 * Three dependency-free routes exist, and the choice between them is availability:
 *
 *  - `zsh/zpty` — **the in-repo precedent, and not reused here.** `scripts/complete-zsh.zsh`
 *    already drives a real pty this way (`zmodload zsh/zpty`, then a literal TAB written into
 *    an interactive zsh), for `completions.test.ts`'s zsh case. It is the right tool there,
 *    because what that test needs a terminal *for* is zsh's own completion widget. Here the
 *    shell is irrelevant — the subject is a Node program — and zsh is a guard rather than a
 *    given: that suite is `it.runIf(has('zsh'))` and its workflow apt-installs zsh on
 *    `ubuntu-latest`, which is the one OS this case least needs help with.
 *  - `script(1)` — **rejected, measured.** BSD `script` (macOS) calls `tcgetattr` on its own
 *    stdin to copy the terminal's settings, so with a pipe there it exits
 *    `tcgetattr/ioctl: Operation not supported on socket` before running anything. A test
 *    runner's stdin is never a tty, so this fails on a developer's machine and in Actions
 *    alike. The util-linux spelling also takes different flags, so it is two techniques.
 *  - `python3 -c 'import pty'` — **used here.** `pty.fork()` is Python's standard library and
 *    is preinstalled on every GitHub-hosted runner, macOS and Linux alike, with no install
 *    step — which is what decides it over `zpty` for a case that wants to run in the ordinary
 *    `npm test` on the `compat.yml` matrix rather than in a shell-specific job. Nothing enters
 *    the lockfile: the same borrowing as calling `git` in `compat-oracle/src/vendor.ts`.
 *
 * ## Windows is not covered, and cannot be at this price
 *
 * PLAN 2.5.4 asks for three OSes. This delivers two, and the third is not a matter of effort:
 * Python's `pty` module is POSIX-only, and a Windows pseudo-console means `CreatePseudoConsole`
 * (ConPTY) in `kernel32`, reachable only from a native addon. Covering Windows costs
 * `node-pty` — a native build, a compiler on every runner, and the end of U1. That is a
 * decision for a person, so the case is skipped with this note rather than quietly dropped.
 *
 * ## Proven to fail on the unfixed state
 *
 * With the fixture's `processTeardown(...)` replaced by a bare `host.exit(130)` — the engine's
 * only exit before `shutdown.ts` existed — the marker file stays empty and the case goes red on
 * `cleanup ran`. That is the bug this grades: a signal that ends the program without running
 * what the program registered.
 */
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

/** `pty.fork()` in the standard library. Absent on Windows, so the probe answers for both. */
function pythonWithPty(): string | undefined {
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

const python = pythonWithPty();
const dir = mkdtempSync(join(tmpdir(), 'burgee-pty-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/**
 * Allocate a pty, run `node <file>` on it, relay our stdin to the master, echo the slave back.
 *
 * Written out rather than reached for, because the interesting half is the loop: the child's
 * output has to be drained while it runs, or a child that fills the pty buffer blocks forever
 * and the case becomes a timeout with no explanation.
 */
const PTY_HOST = `
import os, pty, select, sys
pid, fd = pty.fork()
if pid == 0:
    os.execv(sys.argv[1], [sys.argv[1], sys.argv[2]])
    os._exit(127)
while True:
    try:
        ready, _, _ = select.select([fd, 0], [], [], 10)
    except (OSError, ValueError):
        break
    if not ready:
        break
    if fd in ready:
        try:
            data = os.read(fd, 1024)
        except OSError:
            break
        if not data:
            break
        os.write(1, data)
    if 0 in ready:
        typed = os.read(0, 1024)
        if typed:
            os.write(fd, typed)
_, status = os.waitpid(pid, 0)
# Both halves of the wait status, separately. Collapsing them to the shell's 128+n would hide
# the distinction this file is about: dying *of* a signal is not the same as calling exit().
sys.stderr.write("SIGNAL %d CODE %d\\n" % (status & 0x7f, status >> 8))
`;

/**
 * A burgee program that registers cleanup the way a real one does and then waits to be
 * interrupted. It imports the **built** `dist/shutdown.js`, guaranteed present by turbo's
 * `test` depending on `build`, because what is under test is what ships.
 *
 * The marker is written with `writeFileSync` from the handler: a signal that kills the process
 * mid-handler must not be able to leave a half-written file that reads as success.
 */
function fixture(marker: string): string {
  const shutdown = new URL('../dist/shutdown.js', import.meta.url).href;
  return `
import { writeFileSync } from 'node:fs';
import { processTeardown } from ${JSON.stringify(shutdown)};

const teardown = processTeardown([process.stdout]);
teardown.add(() => { writeFileSync(${JSON.stringify(marker)}, 'cleaned up'); }, 'the marker');

process.stdout.write('ready\\n');
setTimeout(() => { process.stdout.write('never\\n'); }, 10_000);
`;
}

interface Outcome {
  output: string;
  /** The signal the child died of, or 0 when it exited of its own accord. */
  signal: number | undefined;
  /** The code it exited with, meaningful only when `signal` is 0. */
  code: number | undefined;
  cleanedUp: string;
}

async function pressCtrlC(python: string): Promise<Outcome> {
  const marker = join(dir, `marker-${String(Math.random()).slice(2)}`);
  const program = join(dir, `program-${String(Math.random()).slice(2)}.mjs`);
  writeFileSync(program, fixture(marker));

  return await new Promise<Outcome>((settle, fail) => {
    // eslint-disable-next-line node-security/detect-child-process -- already the form the rule's own fix names: `spawn` with an argument array and no shell, so nothing is parsed as a command line. Every argument is built here — `python` is a literal probed above, `PTY_HOST` is a constant, `process.execPath` is Node's own, and `program` is a path this function just wrote inside its own mkdtemp. None of it is reachable from a caller.
    const host = spawn(python, ['-c', PTY_HOST, process.execPath, program], { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    let status = '';
    let pressed = false;

    host.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      // Press the key once the program says it is listening, rather than after a fixed wait:
      // a sleep long enough to be safe on a loaded CI runner is a sleep in every green run.
      if (!pressed && output.includes('ready')) {
        pressed = true;
        host.stdin.write('\x03');
      }
    });
    host.stderr.on('data', (chunk: Buffer) => { status += chunk.toString(); });
    host.on('error', fail);
    host.on('close', () => {
      const wait = /SIGNAL (\d+) CODE (\d+)/.exec(status);
      let cleanedUp = '';
      try {
        cleanedUp = readFileSync(marker, 'utf-8');
      } catch {
        cleanedUp = '';
      }
      settle({
        output,
        signal: wait?.[1] === undefined ? undefined : Number(wait[1]),
        code: wait?.[2] === undefined ? undefined : Number(wait[2]),
        cleanedUp,
      });
    });
  });
}

const reason =
  process.platform === 'win32'
    ? 'Windows has no POSIX pty; a pseudo-console needs ConPTY through a native addon (see the note above)'
    : 'no python3 with the stdlib `pty` module on this machine';

describe.skipIf(python === undefined || process.platform === 'win32')(
  'E5 — Ctrl+C at a real terminal runs the program’s cleanup and leaves with 130',
  () => {
    it('is a real terminal, so the keystroke becomes a signal rather than a byte', async () => {
      const seen = await pressCtrlC(python as string);
      // The tty driver echoes `^C` for a signal-generating key. A pipe never does, so this is
      // the assertion that says the harness under the test is the thing it claims to be.
      expect(seen.output, 'the child did not run on a pty').toContain('ready');
      expect(seen.output.replace(/\r/g, ''), 'no ^C echo: this was not a signal-generating terminal').toContain('^C');
    }, 30_000);

    it('runs the handler the program registered before the process goes', async () => {
      const seen = await pressCtrlC(python as string);
      expect(seen.cleanedUp, 'cleanup ran').toBe('cleaned up');
    }, 30_000);

    /**
     * The measured answer, and it is not the one `shutdown.test.ts` records.
     *
     * Against a fake process, closeout's stand-down calls `exit(130)` and the case asserts
     * `ExitCode.SIGINT`. Against a **real** one it does the POSIX-correct thing instead: it
     * removes its handler and re-raises, so the child dies *of* `SIGINT` and `waitpid` reports
     * `WIFSIGNALED` with signal 2. A parent shell then prints 130 because 128+2 is how a shell
     * spells a signal death — the 130 is the shell's arithmetic, not an `exit()` call.
     *
     * Both spellings are graded, because a program that called `exit(130)` here would be
     * *wrong*: it would tell its parent "I chose to stop", and a `make` or a `xargs` upstream
     * would not know the user had interrupted the run.
     */
    it('dies of the signal rather than exiting, which is what 130 actually means', async () => {
      const seen = await pressCtrlC(python as string);
      expect(seen.signal, 'killed by SIGINT (2)').toBe(2);
      // 128 + 2. Spelled out so the relationship is the assertion, not a magic number.
      expect(128 + (seen.signal ?? 0)).toBe(130);
    }, 30_000);
  },
);

// A skipped suite that nobody can see is a suite that quietly stopped running. One always-on
// case reports which of the two reasons applies on this machine.
describe('the pty harness says when it is not running', () => {
  it('names why, when it is skipped', () => {
    if (python !== undefined && process.platform !== 'win32') {
      expect(python).toMatch(/python/);
      return;
    }
    expect(reason).toBeTruthy();
    console.warn(`[pty-signal] skipped: ${reason}`);
  });
});
