/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Every dependency the lockfile names must resolve inside the lockfile — the question
 * `scripts/lockfile-lock.test.ts` asks, answerable from one file with no install and no `main`.
 *
 * It lives here, outside the test, so `quality.yml`'s `Lockfile Sync` can ask it with plain
 * `node` before anything is installed. That step's `npm ci --dry-run` is Node 24's npm 11.6.2,
 * which passes a lock missing the platform-only `@emnapi` entries; npm 11.16 and Node 26 refuse
 * it ("Missing: @emnapi/core@1.11.3 from lock file"), which is how #1088 reached the Windows lane.
 *
 * Usage: node --no-warnings scripts/lockfile-resolves.ts [package-lock.json]
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface Entry {
  link?: boolean;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

export interface Lock {
  packages: Record<string, Entry>;
}

/** Both kinds count: the `@emnapi` pair are `optionalDependencies`, and npm demanded them anyway. */
const declared = (entry: Entry): string[] => [...Object.keys(entry.dependencies ?? {}), ...Object.keys(entry.optionalDependencies ?? {})];

/**
 * Every declared dependency that no entry satisfies, as `<declarer> -> <name>`.
 *
 * Resolution is node's own: from the declaring path, try `<dir>/node_modules/<name>`, then
 * strip one `/node_modules/<segment>` and try again, ending at the root. A `link: true` entry
 * is a workspace pointer whose real dependencies are listed at the target.
 */
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

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const path = resolve(process.argv[2] ?? join(fileURLToPath(new URL('..', import.meta.url)), 'package-lock.json'));
  const missing = unresolved(JSON.parse(readFileSync(path, 'utf8')) as Lock);
  for (const m of missing) console.error(`::error::package-lock.json: ${m} has no entry to resolve to — npm >= 11.16 refuses this lock with "Missing: … from lock file"`);
  if (missing.length > 0) {
    console.error('Restore the entries from main as the last edit to the file (an npm that prunes them cannot regenerate them), then rerun this script.');
    process.exit(1);
  }
  console.log('✅ Every dependency the lockfile names resolves inside it.');
}
