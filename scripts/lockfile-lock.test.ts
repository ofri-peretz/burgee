/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — every dependency the lockfile names must resolve inside the lockfile.
 *
 * The incident: some npm versions prune optional dependencies that only resolve on other
 * platforms — `@emnapi/core` and `@emnapi/runtime` today, whatever the tree grows tomorrow.
 * It is the npm version that decides, not the platform: measured on one macOS machine from
 * this repo's own lockfile, `npm@11.6.2` drops both and `npm@11.16.0` leaves the file
 * byte-identical. The release branch that proved it was written by the changesets job on
 * `ubuntu-latest`, so "regenerated on a Mac" is the wrong thing to look for. Whoever
 * regenerates it, **every CI runner then refuses the result**:
 *
 *   npm error `npm ci` can only install packages when your package.json and
 *   package-lock.json are in sync. Missing: @emnapi/core@1.11.3 from lock file
 *
 * It cost four pull requests and six round trips to CI in one afternoon, and the reason it
 * kept costing them is that the obvious local check cannot catch it: `npm ci --dry-run`
 * passes on the machine that caused the problem, because on that machine npm never looks for
 * the entries it just removed. **A verification step that cannot fail for the reason the
 * build fails is not a verification step.**
 *
 * **This lock used to ask a different question** — "does the branch drop anything `main`
 * has?" — and that question has two faults. It is too weak, because it needs a reachable
 * `main` and silently skips on a shallow clone. And it is too strong, because a dependency
 * bump legitimately removes entries: #378 dropped seventeen, every one of them a package
 * that nothing left in the tree requires, and the lock red-lit a correct lockfile.
 *
 * What npm actually refuses is a *dangling* entry: a package still declared by something
 * that survived, with no entry of its own to resolve to. That is answerable from one
 * lockfile, needs no install and no `main`, and it names the missing package the way npm
 * does. Removing `node_modules/@emnapi/core` from this repo's lockfile makes it report
 * `node_modules/@tailwindcss/oxide-wasm32-wasi -> @emnapi/core`, which is the error above.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { load as loadYaml } from 'js-yaml';
import { describe, expect, it } from 'vitest';

import { type Lock, unresolved } from './lockfile-resolves.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const committed = (): Lock => JSON.parse(execFileSync('git', ['show', 'HEAD:package-lock.json'], { cwd: REPO_ROOT, encoding: 'utf8' })) as Lock;

describe('the committed lockfile resolves', () => {
  it('every dependency it names has an entry to resolve to', () => {
    expect(
      unresolved(committed()),
      'npm will refuse this lockfile with "Missing: <name> from lock file". An npm old enough to have the bug (11.6.2 does, 11.16.0 does not) prunes optional dependencies that only resolve on other platforms; regenerate with a newer npm, or restore the entries from main as the last edit to the file — and check with this test rather than `npm ci --dry-run`, which passes on the machine that caused it',
    ).toEqual([]);
  });

  it('reports a pruned entry the way npm does — the check can fail', () => {
    // Without this the assertion above is a check nobody has seen fail, which is how the
    // last four green-but-blind gates got here. Prunes the exact entry from the incident.
    const lock = committed();
    expect(Object.keys(lock.packages)).toContain('node_modules/@emnapi/core');
    // Every copy, not just the hoisted one: npm prunes them all, and a dedupe can nest one
    // under oxide-wasm32-wasi, which would still resolve if only the root entry went.
    for (const p of Object.keys(lock.packages)) if (p === 'node_modules/@emnapi/core' || p.endsWith('/node_modules/@emnapi/core')) delete lock.packages[p];
    expect(unresolved(lock)).toContain('node_modules/@tailwindcss/oxide-wasm32-wasi -> @emnapi/core');
  });
});

/**
 * #1088 is why this lock also runs outside vitest. Its lock lacked both `@emnapi` entries, and
 * the test above was red on it, but the Unit Tests lane had not started when `Node 26 ·
 * windows-latest` failed `npm ci` 28 seconds in. The Fast checks lane's own `Lockfile Sync`
 * passed: its `npm ci --dry-run` is Node 24's npm 11.6.2, which never looks for the entries.
 * So the same question is asked by `scripts/lockfile-resolves.ts`, with plain `node` and before
 * anything is installed, in that step.
 */
describe('the fast lane asks it before anything installs', () => {
  const SCRIPT = 'scripts/lockfile-resolves.ts';

  it('Lockfile Sync runs the script', () => {
    const quality = loadYaml(readFileSync(join(REPO_ROOT, '.github/workflows/quality.yml'), 'utf8')) as {
      jobs: Record<string, { steps?: { id?: string; run?: string }[] }>;
    };
    const step = Object.values(quality.jobs)
      .flatMap((job) => job.steps ?? [])
      .find((s) => s.id === 'lockfile');
    expect(step?.run, 'quality.yml has no `id: lockfile` step, or it no longer runs the resolver').toContain(`node --no-warnings ${SCRIPT}`);
  });

  it("refuses #1088's lock the way npm on Windows did, and passes the committed one", () => {
    const run = (lock: string): { status: number; out: string } => {
      const r = spawnSync(process.execPath, ['--no-warnings', SCRIPT, lock], { cwd: REPO_ROOT, encoding: 'utf8' });
      return { status: r.status ?? -1, out: `${r.stdout}${r.stderr}` };
    };
    const dir = mkdtempSync(join(tmpdir(), 'lockfile-resolves-'));
    try {
      const pruned = committed();
      for (const p of Object.keys(pruned.packages)) if (p === 'node_modules/@emnapi/core' || p === 'node_modules/@emnapi/runtime') delete pruned.packages[p];
      writeFileSync(join(dir, 'pruned.json'), JSON.stringify(pruned));
      writeFileSync(join(dir, 'committed.json'), JSON.stringify(committed()));

      const refused = run(join(dir, 'pruned.json'));
      expect(refused.status).toBe(1);
      expect(refused.out).toContain('node_modules/@tailwindcss/oxide-wasm32-wasi -> @emnapi/core');
      expect(run(join(dir, 'committed.json'))).toEqual({ status: 0, out: expect.any(String) as string });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
