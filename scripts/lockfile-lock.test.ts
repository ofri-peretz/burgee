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
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

interface Entry {
  link?: boolean;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

interface Lock {
  packages: Record<string, Entry>;
}

/**
 * Every declared dependency that no entry satisfies, as `<declarer> -> <name>`.
 *
 * Resolution is node's own: from the declaring path, try `<dir>/node_modules/<name>`, then
 * strip one `/node_modules/<segment>` and try again, ending at the root. `optionalDependencies`
 * count — the `@emnapi` pair are optional, and npm demanded them anyway. A `link: true` entry
 * is a workspace pointer whose real dependencies are listed at the target.
 */
/** Both kinds count: the `@emnapi` pair are `optionalDependencies`, and npm demanded them anyway. */
const declared = (entry: Entry): string[] => [...Object.keys(entry.dependencies ?? {}), ...Object.keys(entry.optionalDependencies ?? {})];

export function unresolved(lock: Lock): string[] {
  const paths = new Set(Object.keys(lock.packages));
  return Object.entries(lock.packages)
    .filter(([, entry]) => entry.link !== true)
    .flatMap(([from, entry]) => declared(entry).filter((name) => !resolves(paths, from, name)).map((name) => `${from === '' ? '<root>' : from} -> ${name}`));
}

/** Node's own lookup: try `<dir>/node_modules/<name>`, strip one `/node_modules/<segment>`, repeat to the root. */
function resolves(paths: ReadonlySet<string>, from: string, name: string): boolean {
  for (let dir = from; ; ) {
    if (paths.has(dir === '' ? `node_modules/${name}` : `${dir}/node_modules/${name}`)) return true;
    if (dir === '') return false;
    const cut = dir.lastIndexOf('/node_modules/');
    dir = cut === -1 ? '' : dir.slice(0, cut);
  }
}

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
    delete lock.packages['node_modules/@emnapi/core'];
    expect(unresolved(lock)).toContain('node_modules/@tailwindcss/oxide-wasm32-wasi -> @emnapi/core');
  });
});
