/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * `agent-headroom` R6 — no hint is removed to save a byte (intent constraint 1).
 *
 * Every surface this intent added makes a *success* smaller: `--json=<fields>` selects, a
 * registered format (`--format=agent`, `--format=tsv`, a plugin's own) drops the envelope, and
 * `--max-bytes` cuts rows. None of them may touch a *failure*. A failure's `hint` and `fix` are
 * why an agent recovers in one turn instead of three, and they are the bytes a size-minded
 * change would be tempted to drop first.
 *
 * So the lock is stated as an identity, not as "a hint is present": a failing command run with
 * any of those surfaces typed writes **exactly** what it writes without them — the same envelope
 * byte for byte under `--json`, the same prose (`hint:` and `fix:` lines included) on stderr
 * without it, and nothing on stdout. Each failing command below carries a hint whose words are
 * checked first, so the identity cannot hold by both sides having lost it.
 */
import { describe, expect, it } from 'vitest';

import { defineError } from './define-error.js';
import { AuthError, defineCommand, defineProgram, UsageError } from './index.js';
import { definePlugin } from './plugin.js';
import { runBurgee } from './testing.js';

const QuotaError = defineError({ name: 'QuotaError', code: 97, description: 'the quota is spent' });

const program = defineProgram({
  name: 'app',
  version: '1.0.0',
  commands: [
    defineCommand({
      name: 'deploy',
      effects: 'non_idempotent',
      run: () => {
        throw new QuotaError('the build quota is spent', { hint: 'wait for the window to reset, or raise the quota', fix: 'app quota raise --by 10' });
      },
    }),
    defineCommand({ name: 'login', effects: 'read_only', run: () => Promise.reject(new AuthError('no token', 'set APP_TOKEN, or log in', 'app auth login')) }),
    defineCommand({
      name: 'shape',
      effects: 'read_only',
      run: () => {
        throw new UsageError('the shape is not one this command draws', 'pass a shape the --help lists');
      },
    }),
    // A list command that declares its fields, so `--json=<a>` is a selection it accepts — and fails.
    defineCommand({ name: 'ls', effects: 'read_only', fields: ['name', 'size'], run: () => Promise.reject(new UsageError('the listing is locked', 'unlock it with app unlock')) }),
    // A plain runtime failure: no hint of its own, so what it teaches is the command's usage (D-20260930).
    defineCommand({
      name: 'crash',
      effects: 'read_only',
      options: { level: { type: 'number', description: 'how loud' } },
      run: () => {
        throw new Error('the disk is full');
      },
    }),
  ],
});

// A registered format that would print nothing at all: if a failure ever reached a format, this one would eat the hint.
program.use(definePlugin({ name: 'quiet-rows', formats: { rows: { description: 'drops everything', render: () => '' } } }));

/** Each failing command, and the words of the hint it carries, checked before any identity is. */
const FAILING: [command: string, hint: string | undefined][] = [
  ['deploy', 'wait for the window to reset, or raise the quota'],
  ['login', 'set APP_TOKEN, or log in'],
  ['shape', 'pass a shape the --help lists'],
  ['ls', 'unlock it with app unlock'],
  ['crash', undefined],
];

/** What a run writes, without the timing. */
const written = async (argv: string[]): Promise<{ code: number; stdout: string; stderr: string }> => {
  const { code, stdout, stderr } = await runBurgee(program, { argv });
  return { code, stdout, stderr };
};

/** The surfaces that shrink a success, typed beside `--json`: each must leave the failure envelope as it was. */
const BESIDE_JSON = [['--json=name'], ['--format=agent', '--json'], ['--format=tsv', '--json'], ['--format=rows', '--json'], ['--max-bytes', '10', '--json'], ['--max-bytes=10', '--json=name', '--format=tsv']];

/** The same surfaces typed alone: the failure stays prose on stderr, exactly as it is without them. */
const ALONE = [['--format=agent'], ['--format=tsv'], ['--format=rows'], ['--max-bytes', '10', '--format=agent'], ['--max-bytes=10', '--format=rows']];

describe.each(FAILING)('%s fails, and what it teaches survives every surface that shrinks a success (R6)', (command, hint) => {
  it('carries its hint and fix in the plain --json envelope — the reference the identities below are taken against', async () => {
    const reference = await written([command, '--json']);
    expect(reference.code).not.toBe(0);
    const { error } = JSON.parse(reference.stdout) as { error: { hint?: string; fix?: string; usage?: unknown } };
    expect(error.hint).toBe(hint);
    if (command === 'crash') expect(error.usage).toBeDefined();
    if (command === 'deploy') expect(error.fix).toBe('app quota raise --by 10');
    if (command === 'login') expect(error.fix).toBe('app auth login');
  });

  it.each(BESIDE_JSON)('with %s the envelope is the --json one, byte for byte', async (...flags) => {
    expect(await written([command, ...flags])).toEqual(await written([command, '--json']));
  });

  it.each(ALONE)('with %s the failure is the same prose on stderr, hint and fix included, and stdout is empty', async (...flags) => {
    const plain = await written([command]);
    const shrunk = await written([command, ...flags]);
    expect(shrunk).toEqual(plain);
    expect(shrunk.stdout).toBe('');
    if (hint !== undefined) expect(shrunk.stderr).toContain(`hint: ${hint}\n`);
  });
});
