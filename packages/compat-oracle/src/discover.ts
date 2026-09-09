/**
 * Which vendored files are a host's tests.
 *
 * One function, because three steps have to agree about the answer and did not: the vendor
 * step copied `test/issues/` whole (four files, five cases), the runner's `readdirSync` was
 * flat and never saw them, and the fingerprint hashed only what the runner could reach. A
 * suite that is copied, committed and never executed inflates nothing and proves nothing —
 * it just is not in the number, silently. Discovery is recursive here, and a directory that
 * is deliberately *not* graded has to be named in `ungradedDirs` with a reason.
 */
import { readdirSync } from 'node:fs';
import { join, matchesGlob, sep } from 'node:path';

import { type Host } from './hosts.js';

/**
 * Never descended into, for any host: a package install or a runner's cache is not part of
 * anyone's suite, and `testDir: '.'` (ora, log-update) points the walk at a repo root where
 * both turn up.
 */
const NEVER = new Set(['node_modules']);

/** Specifiers and record keys are posix whatever the OS wrote them. */
export const posix = (p: string): string => p.split(sep).join('/');

/**
 * Every file under `dir` that `keep` accepts, as posix paths relative to `dir`, sorted.
 * Dot-directories, `node_modules` and the host's declared `ungradedDirs` are pruned — the
 * last of those is the only way a copied directory can stay out of the walk, and it costs
 * a written reason.
 */
export function walkFiles(dir: string, host: Host, keep: (name: string) => boolean): string[] {
  const pruned = new Set((host.ungradedDirs ?? []).map((d) => d.dir));
  const found: string[] = [];
  const walk = (at: string, prefix: string): void => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || NEVER.has(entry.name) || pruned.has(rel)) continue;
        walk(join(at, entry.name), rel);
        continue;
      }
      if (entry.isFile() && keep(entry.name)) found.push(rel);
    }
  };
  walk(dir, '');
  return found.sort();
}

/**
 * The host's own glob decides what is a test — ora's suite sits at the repo root next to
 * `index.js`, and running the implementation as a test file is not a grade. The preamble is
 * loaded by the runner, never graded as a file of its own.
 */
export function testFiles(dir: string, host: Host): string[] {
  return walkFiles(dir, host, (name) => matchesGlob(name, host.testGlob)).filter((rel) => rel !== host.preamble);
}
