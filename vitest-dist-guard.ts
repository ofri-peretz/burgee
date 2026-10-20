/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * A test run leaves `dist/` exactly as the build left it.
 *
 * `dist/` is what `check:artifacts`, `declaration-reach` and the weight locks read as *the
 * published package*. A suite that writes a fixture, a bundle or a scratch file into it makes
 * every one of those read something nobody will publish: on 2026-10-19 a local burgee run was
 * reported leaving about 43 stray files there, and both gates failed on files no source
 * produces. Nobody saw which test it was, because nothing was looking.
 *
 * So the package's vitest config runs this as a `globalSetup` (vitest calls its named `setup`): it lists `dist/` (paths, sizes
 * and modification times) before the first test file loads and again after the last one ends,
 * and fails the run naming every file that appeared, vanished or changed. The fix for a hit is
 * the test's, never this file's: point the write at a scratch directory (`scripts/scratch-dir.ts`).
 */
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** One file's identity for this purpose: a write changes its size or its mtime. */
export type Listing = ReadonlyMap<string, string>;

/** Every file under `dir`, keyed by its path relative to `dir`. An absent `dir` lists nothing. */
export function listing(dir: string): Listing {
  const out = new Map<string, string>();
  let entries: string[];
  try {
    entries = readdirSync(dir, { recursive: true, encoding: 'utf8' });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const stat = statSync(join(dir, entry), { throwIfNoEntry: false });
    if (stat?.isFile() === true) out.set(entry.replaceAll('\\', '/'), `${String(stat.size)}:${String(stat.mtimeMs)}`);
  }
  return out;
}

/** What a run did to `dist/`, one line per file, sorted: empty when it did nothing. */
export function changes(before: Listing, after: Listing): string[] {
  const out: string[] = [];
  for (const [file, id] of after) {
    const was = before.get(file);
    if (was === undefined) out.push(`+ ${file}`);
    else if (was !== id) out.push(`~ ${file}`);
  }
  for (const file of before.keys()) if (!after.has(file)) out.push(`- ${file}`);
  return out.toSorted((a, b) => (a.slice(2) < b.slice(2) ? -1 : 1));
}

/** The refusal, naming the directory and every file, so the test that wrote it can be found. */
export function refusal(dir: string, lines: readonly string[]): string {
  // `/` on every platform, so the refusal reads the same on a Windows cell as anywhere else.
  const where = (relative(process.cwd(), dir) || dir).replaceAll('\\', '/');
  return `the test run changed ${where} (${String(lines.length)} file${lines.length === 1 ? '' : 's'}) — a test wrote into the build output. Point it at a scratch directory (scripts/scratch-dir.ts):\n  ${lines.join('\n  ')}`;
}

/** vitest's `globalSetup`: list the project's `dist/` now, and return the teardown that compares. */
export function setup(project?: { config: { root: string } }): () => void {
  const dir = join(project?.config.root ?? process.cwd(), 'dist');
  const before = listing(dir);
  return () => {
    const lines = changes(before, listing(dir));
    if (lines.length > 0) throw new Error(`${refusal(dir, lines)}`);
  };
}
