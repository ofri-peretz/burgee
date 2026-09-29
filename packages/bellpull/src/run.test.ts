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
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it, vi } from 'vitest';

import { run, SpawnError, type ExitHost } from './run.js';
import { type Runtime } from './runtime.js';
import { NotFoundError } from './which.js';

const WINDOWS = process.platform === 'win32';
const SPAWN = 60_000;

const dir = mkdtempSync(join(tmpdir(), 'bellpull-run-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

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
