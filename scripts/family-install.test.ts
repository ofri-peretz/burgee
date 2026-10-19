/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * `installStamp` — the install-heavy locks skip an install whose exact tarballs already passed on
 * this machine, and only there.
 *
 * A wrong answer here is quiet either way: a stamp that hits when a byte changed lets a broken
 * tarball through every local push, and one that never hits puts thousands of new files back on
 * every push. CI cannot see either, because CI never reads a stamp. So these cases hold the four
 * answers — a miss runs, a pass is remembered and then hit, a failure is not remembered, and CI and
 * `BURGEE_LOCKS_FULL=1` always run — against a cache directory of their own.
 */
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { installStamp, type Outcome } from './family-install.js';

const made: string[] = [];
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

/** A cache, a lock file and two tarballs of its own, so no case reads what another wrote. */
function scratch(): { env: NodeJS.ProcessEnv; lock: string; tarballs: string[]; stamps: () => string[] } {
  const dir = mkdtempSync(join(tmpdir(), 'burgee-install-stamp-'));
  made.push(dir);
  const lock = join(dir, 'some-lock.test.ts');
  writeFileSync(lock, 'the lock\n');
  const tarballs = ['a-1.0.0.tgz', 'b-1.0.0.tgz'].map((name) => join(dir, name));
  for (const t of tarballs) writeFileSync(t, `bytes of ${t}`);
  const cache = join(dir, 'cache');
  const stamps = (): string[] => (existsSync(join(cache, 'burgee-locks')) ? readdirSync(join(cache, 'burgee-locks')) : []);
  return { env: { XDG_CACHE_HOME: cache }, lock, tarballs, stamps };
}

/** A suite shaped like vitest's: one test at the top, the rest one describe down. */
const suite = (...states: string[]): Outcome => ({ tasks: [{ result: { state: 'pass' } }, { tasks: states.map((state) => ({ result: { state } })) }] });

describe('installStamp', () => {
  it('misses on a fresh cache, remembers a run that passed, and then names the stamp it skips for', () => {
    const { env, lock, tarballs, stamps } = scratch();
    const first = installStamp(lock, tarballs, env);
    expect(first.skip).toBeUndefined();
    first.record(suite('pass', 'pass'));
    expect(stamps()).toEqual([expect.stringMatching(/^some-lock-[0-9a-f]{64}$/u)]);
    const again = installStamp(lock, tarballs, env).skip;
    expect(again).toContain(`passed some-lock before (${join(env['XDG_CACHE_HOME'] ?? '', 'burgee-locks', stamps()[0] ?? '')})`);
    expect(again).toContain('BURGEE_LOCKS_FULL=1 runs it again');
  });

  it('does not remember a run in which any test failed or was skipped', () => {
    const { env, lock, tarballs, stamps } = scratch();
    installStamp(lock, tarballs, env).record(suite('pass', 'fail'));
    installStamp(lock, tarballs, env).record(suite('skip'));
    expect(stamps()).toEqual([]);
  });

  it('misses again when one tarball byte or the lock itself changes', () => {
    const { env, lock, tarballs, stamps } = scratch();
    installStamp(lock, tarballs, env).record(suite('pass'));
    writeFileSync(tarballs[1] ?? '', 'other bytes');
    expect(installStamp(lock, tarballs, env).skip).toBeUndefined();
    writeFileSync(lock, 'the lock, edited\n');
    expect(installStamp(lock, tarballs, env).skip).toBeUndefined();
    expect(stamps()).toHaveLength(1);
  });

  it('never skips or writes under CI or BURGEE_LOCKS_FULL=1, even over a stamp that would hit', () => {
    const { env, lock, tarballs, stamps } = scratch();
    installStamp(lock, tarballs, env).record(suite('pass'));
    for (const extra of [{ CI: 'true' }, { BURGEE_LOCKS_FULL: '1' }]) {
      const full = installStamp(lock, tarballs, { ...env, ...extra });
      expect(full.skip).toBeUndefined();
      full.record(suite('pass'));
    }
    writeFileSync(tarballs[0] ?? '', 'changed');
    installStamp(lock, tarballs, { ...env, CI: 'true' }).record(suite('pass'));
    expect(stamps()).toHaveLength(1);
  });
});
