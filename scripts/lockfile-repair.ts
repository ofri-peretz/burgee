/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Put back every entry `lockfile-resolves.ts` reports missing, copied from a reference lock
 * (`main`'s by default) — the hand repair of #1416 (#1429) and #1438 (#1441), as one command.
 *
 * An npm that prunes the platform-only `@emnapi` entries (11.6.2 does, 11.16.0 does not) cannot
 * regenerate them, so the repair is a copy, and it must be the last edit to the file. Only the
 * dangling names are touched: each is looked up the way node resolves it from the package that
 * declares it, the first path that exists in the reference is copied, and it goes in at npm's
 * own sort position. Nothing else in the lock moves, so the diff is the restored entries alone.
 * A restored entry can itself declare something missing (`@emnapi/core` declares
 * `@emnapi/wasi-threads`), so it repeats until nothing dangles or nothing more can be copied.
 *
 * Usage: npx tsx scripts/lockfile-repair.ts [package-lock.json] [reference-lock.json]
 *        (the reference defaults to `git show origin/main:package-lock.json`)
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { type Lock, unresolved } from './lockfile-resolves.js';

export interface Restored {
  path: string;
  version: string | undefined;
}

export interface Repair {
  /** The repaired lock: the input with the restored entries spliced in, nothing else changed. */
  lock: Lock;
  /** Each path copied from the reference, with the version it carried. */
  restored: Restored[];
  /** `<declarer> -> <name>` pairs the reference has no entry for either. */
  unrepairable: string[];
}

/** A lock is tens of megabytes at most; `execFileSync`'s 1 MiB default is not enough for one. */
const LOCK_BUFFER_BYTES = 64 * 1024 * 1024;

/** npm writes `packages` with the root first and the rest sorted by `localeCompare(…, 'en')`. */
function npmOrder(a: string, b: string): number {
  if (a === '') return -1;
  if (b === '') return 1;
  return a.localeCompare(b, 'en');
}

/** The paths node would try for `name` from `from`, nearest first — the order `unresolved` checks. */
function lookupChain(from: string, name: string): string[] {
  const chain: string[] = [];
  for (let dir = from; ; ) {
    chain.push(dir === '' ? `node_modules/${name}` : `${dir}/node_modules/${name}`);
    if (dir === '') return chain;
    const cut = dir.lastIndexOf('/node_modules/');
    dir = cut === -1 ? '' : dir.slice(0, cut);
  }
}

/** One pass: copy, for each dangling pair, the first path on its lookup chain the reference has. */
function restoreOnce(packages: Lock['packages'], reference: Lock, dangling: string[]): Restored[] {
  const added: Restored[] = [];
  for (const pair of dangling) {
    const [declarer, name] = pair.split(' -> ') as [string, string];
    const path = lookupChain(declarer === '<root>' ? '' : declarer, name).find((p) => p in reference.packages);
    if (path === undefined || path in packages) continue;
    packages[path] = reference.packages[path]!;
    added.push({ path, version: (reference.packages[path] as { version?: string }).version });
  }
  return added;
}

/** Splice each path in before the first key npm sorts after it. Never re-sort: an entry already out of order stays put. */
function spliceInOrder(keys: string[], paths: string[]): string[] {
  const ordered = [...keys];
  for (const path of paths) {
    const at = ordered.findIndex((k) => npmOrder(k, path) > 0);
    ordered.splice(at === -1 ? ordered.length : at, 0, path);
  }
  return ordered;
}

export function repair(lock: Lock, reference: Lock): Repair {
  const packages = { ...lock.packages };
  const restored: Restored[] = [];
  let dangling = unresolved({ packages });
  for (let added = restoreOnce(packages, reference, dangling); added.length > 0; added = restoreOnce(packages, reference, dangling)) {
    restored.push(...added);
    dangling = unresolved({ packages });
  }
  const ordered = spliceInOrder(
    Object.keys(lock.packages),
    restored.map((r) => r.path),
  );
  return { lock: { ...lock, packages: Object.fromEntries(ordered.map((k) => [k, packages[k]!])) }, restored, unrepairable: dangling };
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const path = resolve(process.argv[2] ?? join(root, 'package-lock.json'));
  const referencePath = process.argv[3] === undefined ? undefined : resolve(process.argv[3]);
  const referenceText =
    referencePath === undefined ? execFileSync('git', ['show', 'origin/main:package-lock.json'], { cwd: root, encoding: 'utf8', maxBuffer: LOCK_BUFFER_BYTES }) : readFileSync(referencePath, 'utf8');
  const result = repair(JSON.parse(readFileSync(path, 'utf8')) as Lock, JSON.parse(referenceText) as Lock);
  for (const r of result.restored) console.log(`restored ${r.path}@${r.version ?? '?'}`);
  if (result.restored.length > 0) writeFileSync(path, `${JSON.stringify(result.lock, null, 2)}\n`);
  for (const u of result.unrepairable) console.error(`::error::package-lock.json: ${u} is missing here and in the reference lock too — nothing to copy it from`);
  if (result.unrepairable.length > 0) process.exit(1);
  console.log(result.restored.length > 0 ? '✅ Restored; every dependency the lockfile names now resolves inside it.' : '✅ Nothing to restore.');
}
