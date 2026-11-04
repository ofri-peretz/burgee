/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The cases where `run()` has no result to give — and the one where it resolves nothing.
 *
 * R1 reserves rejection for "no process ran, or none finished", and `matrix.test.ts` proves
 * only the first way that happens: a name that resolves nowhere. There are three more, and
 * each arrives by a different route out of Node, so each is its own case here:
 *
 *  - Node refuses the arguments before any process exists, and **throws** from `spawn`;
 *  - the file resolved, but the kernel will not run it: the interpreter its `#!` names is
 *    missing (`ENOENT`) or is not executable (`EACCES`), which Node **emits** as `error`.
 *
 * The last two are real files on a real disk, and POSIX-only: Windows has no kernel `#!`, so
 * the same script never reaches `execve` there — `windows.test.ts` covers what happens instead.
 */
import { ChildProcess } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it, vi } from 'vitest';

import { discard } from './__fixtures__/scratch-dir.js';
import { DEFAULT_GRACE, DEFAULT_TIMEOUT, run, SpawnError, type ExitHost } from './run.js';
import { type Runtime } from './runtime.js';
import { NotFoundError } from './which.js';

const WINDOWS = process.platform === 'win32';
const SPAWN = 60_000;

const dir = mkdtempSync(join(tmpdir(), 'bellpull-run-'));
afterAll(() => discard(dir));

const runtime: Runtime = { platform: process.platform, env: process.env, cwd: dir, uid: process.getuid?.(), gid: process.getgid?.() };

/** A script this platform agrees is executable, whose `#!` names `interpreter`. */
function script(name: string, interpreter: string): string {
  const at = join(dir, name);
  writeFileSync(at, `#!${interpreter}\necho unreachable\n`);
  chmodSync(at, 0o755);
  return at;
}

describe('SpawnError', () => {
  it('names the command and the reason, and carries the cause', () => {
    const cause = new Error('spawn EPERM');
    const error = new SpawnError('npm', cause);
    expect(error).toMatchObject({ name: 'SpawnError', code: 'ERR_SPAWN_FAILED', command: 'npm', cause, message: 'could not spawn npm: spawn EPERM' });
  });

  it('says what was thrown when what was thrown is not an Error', () => {
    expect(new SpawnError('npm', 'EPERM').message).toBe('could not spawn npm: EPERM');
  });
});

describe('run() rejects when no process ran', () => {
  it(
    'with SpawnError when Node refuses the call itself — an argument with a NUL in it',
    async () => {
      // The file resolves; `spawn` throws before a process exists. No result could be true.
      const failure = run(process.execPath, ['-e', '0', 'a\u0000b'], { runtime });
      await expect(failure).rejects.toThrow(SpawnError);
      await expect(failure).rejects.toMatchObject({ code: 'ERR_SPAWN_FAILED', command: process.execPath, cause: { code: 'ERR_INVALID_ARG_VALUE' } });
    },
    SPAWN,
  );

  it.skipIf(WINDOWS)(
    'with NotFoundError when the interpreter a script names is not there — the kernel’s ENOENT',
    async () => {
      const missing = script('missing-interpreter', join(dir, 'no-such-interpreter'));
      await expect(run(missing, [], { runtime })).rejects.toThrow(NotFoundError);
    },
    SPAWN,
  );

  it.skipIf(WINDOWS)(
    'with SpawnError for any other failure to start — an interpreter that cannot be executed',
    async () => {
      const plain = join(dir, 'not-an-interpreter');
      writeFileSync(plain, 'data\n');
      chmodSync(plain, 0o644);
      const refused = run(script('refused-interpreter', plain), [], { runtime });
      await expect(refused).rejects.toThrow(SpawnError);
      await expect(refused).rejects.toMatchObject({ cause: { code: 'EACCES' } });
    },
    SPAWN,
  );
});

describe('run() with a shell', () => {
  it(
    'resolves nothing itself, and says so: the shell resolved it, so there is no executable to report',
    async () => {
      const result = await run('echo bellpull', [], { runtime, shell: true });
      expect(result.ok).toBe(true);
      expect(result.stdout.trim()).toBe('bellpull');
      expect(result.executable).toBeUndefined();
    },
    SPAWN,
  );

  it(
    'reports no executable even for a name a PATH lookup would have found — the shell chose, not bellpull',
    async () => {
      // `echo` is also `/bin/echo` on Linux and macOS: resolving it anyway would report a file
      // the shell may never have run, since its builtin answers first.
      const result = await run('echo', [], { runtime, shell: true });
      expect(result.ok).toBe(true);
      expect(result.executable).toBeUndefined();
    },
    SPAWN,
  );

  it.skipIf(WINDOWS)(
    'treats a named shell the same as `shell: true`',
    async () => {
      const result = await run('echo named', [], { runtime, shell: '/bin/sh' });
      expect(result.stdout).toBe('named\n');
      expect(result.executable).toBeUndefined();
    },
    SPAWN,
  );
});

/**
 * The `exitHost` handler, fired after its child is gone.
 *
 * A host that snapshots its handlers when shutdown begins can call one whose run has already
 * settled and unregistered. By then the child's pid may belong to another process, so the
 * handler must not signal at all — it checks the child's own record of having exited rather
 * than trusting the call to be timely.
 */
/** An unregister that keeps the handler: the host has already taken its snapshot. */
const keep = (): void => undefined;

describe('a late exit-host handler', () => {
  it(
    'does not signal a child that has already exited',
    async () => {
      let late: (() => unknown) | undefined;
      const host: ExitHost = {
        add: (handler) => {
          late = handler;
          return keep;
        },
      };
      const result = await run(process.execPath, ['-e', '0'], { runtime, exitHost: host });
      expect(result.ok).toBe(true);
      const kill = vi.spyOn(ChildProcess.prototype, 'kill');
      try {
        late?.();
        expect(kill).not.toHaveBeenCalled();
      } finally {
        kill.mockRestore();
      }
    },
    SPAWN,
  );
});

describe('the defaults a caller gets without asking', () => {
  it('is a 30 s deadline and a 5 s grace, as the README promises', () => {
    expect([DEFAULT_TIMEOUT, DEFAULT_GRACE]).toEqual([30_000, 5_000]);
  });

  it(
    'takes no arguments when none are given',
    async () => {
      // stdin from nothing: `node` with no arguments reads its program from stdin, and an empty one exits 0.
      const result = await run(process.execPath, undefined, { runtime, stdio: 'ignore' });
      expect(result).toMatchObject({ ok: true, args: [] });
    },
    SPAWN,
  );

  it(
    'runs the child in the runtime’s working directory when the call names none',
    async () => {
      const result = await run(process.execPath, ['-e', 'process.stdout.write(process.cwd())'], { runtime });
      expect(result.stdout).toBe(realpathSync(dir));
      // Elapsed time, not a timestamp: no spawn on any runner takes as long as the case's own budget.
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.duration).toBeLessThan(SPAWN);
    },
    SPAWN,
  );

  it(
    'resolves with empty output when stdio is not captured, rather than reading a stream that is not there',
    async () => {
      const result = await run(process.execPath, ['-e', 'process.stdout.write("x"); process.stderr.write("y")'], { runtime, stdio: 'ignore' });
      expect(result).toMatchObject({ ok: true, stdout: '', stderr: '' });
    },
    SPAWN,
  );
});

/** `<at>/which-one`, a script that prints `says`. */
function tool(at: string, says: string): string {
  mkdirSync(at, { recursive: true });
  const file = join(at, 'which-one');
  writeFileSync(file, `#!/bin/sh\necho ${says}\n`);
  chmodSync(file, 0o755);
  return file;
}

/**
 * Two halves of one rule: the file `executable` names is the file that runs, and it is found the
 * way `which.ts` finds it — so a `PATH` entry `which.ts` refuses is never one the kernel gets to
 * search instead.
 */
describe.skipIf(WINDOWS)('the file that runs is the file that was resolved', () => {
  it(
    'runs the resolved file even when the child’s own env would find another',
    async () => {
      const a = tool(join(dir, 'path-a'), 'a');
      tool(join(dir, 'path-b'), 'b');
      const result = await run('which-one', [], { runtime: { ...runtime, env: { PATH: join(dir, 'path-a') } }, env: { PATH: join(dir, 'path-b') } });
      expect(result.executable?.path).toBe(a);
      expect(result.stdout).toBe('a\n');
    },
    SPAWN,
  );

  it(
    'refuses a name found only on a relative PATH entry, before the kernel can search it',
    async () => {
      // The kernel would find it: `execvp` searches `rel` against the child's working directory.
      tool(join(dir, 'rel'), 'relative');
      await expect(run('which-one', [], { runtime: { ...runtime, env: { PATH: 'rel' } } })).rejects.toThrow(NotFoundError);
    },
    SPAWN,
  );
});

describe('after the run', () => {
  it(
    'stands its deadline down, so a timer cannot signal a child that has already gone',
    async () => {
      const kill = vi.spyOn(ChildProcess.prototype, 'kill');
      // A deadline a loaded machine's node start-up cannot reach (50 ms was, under the pre-push
      // load), then a wait just past it: a deadline left armed would fire inside that wait.
      const deadline = 2_000;
      try {
        const result = await run(process.execPath, ['-e', '0'], { runtime, timeout: deadline });
        expect(result.timedOut).toBe(false);
        await new Promise((resolve) => setTimeout(resolve, deadline + 100));
        expect(kill).not.toHaveBeenCalled();
      } finally {
        kill.mockRestore();
      }
    },
    SPAWN,
  );

  it.skipIf(WINDOWS)(
    'does not let a late exit-host handler signal a child a signal already ended',
    async () => {
      let late: (() => unknown) | undefined;
      const host: ExitHost = {
        add: (handler) => {
          late = handler;
          return keep;
        },
      };
      const result = await run(process.execPath, ['-e', 'process.kill(process.pid, "SIGKILL")'], { runtime, exitHost: host });
      expect(result.signal).toBe('SIGKILL');
      const kill = vi.spyOn(ChildProcess.prototype, 'kill');
      try {
        late?.();
        expect(kill).not.toHaveBeenCalled();
      } finally {
        kill.mockRestore();
      }
    },
    SPAWN,
  );
});
