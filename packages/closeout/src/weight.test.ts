/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Weight, per entry, against the incumbent the entry replaces (design R8, U5). Mirrors
 * `caique/src/weight.test.ts` and `roundel/src/weight.test.ts`.
 *
 * It reads `dist/`, so it measures what is published rather than what is written, and it
 * grew a comment-stripping build step on the way in: 46,066 B of emitted JavaScript became
 * 20,417 B, and the difference was doc comments that every editor reads out of the `.d.ts`
 * files anyway.
 *
 * **What the measurement said about R8, stated rather than rounded away.** R8 asks for
 * bytes "at or under `exit-hook`", the lightest zero-dependency incumbent in the layer.
 * Measured 2026-09-14 against the vendored copy of `exit-hook@5.1.0` that `compat-oracle`
 * grades us with: its whole implementation is **4,458 B in one file**, and
 * `closeout/exit-hook` reaches **11,841 B** across five. That is over, and it is over for a
 * reason the ceiling did not anticipate — the drop-in shares `registry.ts`, `deadline.ts`
 * and `report.ts` with the rest of the package, which is to say it carries the phase
 * ordering, the bounded runner and the report that names a hung handler. Those three are
 * the product; deleting them to win a byte comparison against a package that cannot do any
 * of it would be optimising the number at the cost of the thing being measured.
 *
 * So the ceiling is recorded as two claims that are true and one that is not:
 *
 *   - **dependencies: 0, the same as `exit-hook`** — asserted below for every entry, and
 *     the half of "weight" that compounds, since a dependency is a tree and a supply chain.
 *   - **the whole package, 20,417 B, replaces six packages** totalling 685 M downloads a
 *     week — the comparison the layer is actually about.
 *   - **the per-file byte ceiling against `exit-hook` alone: not met, 11,841 vs 4,458.**
 *     The design says so in those words rather than quietly restating the requirement.
 */
import { readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const pkgRoot = fileURLToPath(new URL('..', import.meta.url));
const dist = resolve(pkgRoot, 'dist');

interface Manifest {
  exports: Record<string, { import: string } | string>;
}

// Read rather than import: the published entry list is data here, and a JSON import would
// reach out of src/ for it.
const manifest = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf8')) as Manifest;

interface EntryRule {
  /** Bare specifiers this entry may import. Empty everywhere: closeout depends on nothing. */
  allow: string[];
  /** Bytes reachable from it. A ratchet: lowering is free, raising is a decision with a comment. */
  budget: number;
  /** Modules this entry must never reach, whatever else changes. */
  denied: string[];
}

const RULES: Record<string, EntryRule> = {
  // Everything: the registry, the wiring, the cursor, the deadline, the report, `once`.
  // Measured 11,644 B on 2026-09-14.
  '.': { allow: [], budget: 13_000, denied: ['plugin.js', 'exit-hook.js', 'restore-cursor.js'] },
  // `onetime` + `mimic-fn` are 262 M downloads a week between them and this is the whole of
  // what they do: 441 B, reaching nothing at all. Measured 2026-09-14.
  './once': { allow: [], budget: 1_000, denied: ['index.js', 'registry.js', 'install.js', 'report.js', 'deadline.js'] },
  // The escape sequences and the TTY rule, and a leaf by construction: a program that only
  // needs to put a cursor back does not load a registry to do it. Measured 666 B.
  './cursor': { allow: [], budget: 1_500, denied: ['index.js', 'registry.js', 'install.js'] },
  // The plugin host. Carries the registry's phase vocabulary, never the process wiring —
  // registering a plugin must not attach four listeners. Measured 10,583 B.
  './plugin': { allow: [], budget: 12_500, denied: ['install.js', 'exit-hook.js', 'restore-cursor.js'] },
  // The drop-in for `restore-cursor` (107.5 M/wk), graded 6 / 6 by its own suite. Measured
  // 11,159 B — see the header for what that number is and is not.
  './restore-cursor': { allow: [], budget: 12_500, denied: ['plugin.js', 'exit-hook.js'] },
  // The drop-in for `exit-hook` (8.8 M/wk), graded 21 / 21 by its own suite. Measured
  // 11,841 B against the incumbent's 4,458 B in one file.
  './exit-hook': { allow: [], budget: 13_000, denied: ['plugin.js', 'restore-cursor.js', 'cursor.js'] },
};

const SPECIFIER = /(?:from|import)\s*'([^']+)'/g;

function walk(entry: string): { reached: string[]; external: string[]; bytes: number } {
  const files = new Set<string>();
  const external = new Set<string>();
  const queue = [entry];
  let bytes = 0;

  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || files.has(file)) continue;
    files.add(file);
    bytes += statSync(file).size;
    for (const [, spec = ''] of readFileSync(file, 'utf8').matchAll(SPECIFIER)) {
      if (spec.startsWith('.')) queue.push(resolve(dirname(file), spec));
      else if (spec !== '' && !spec.startsWith('node:')) external.add(spec);
    }
  }
  return { reached: [...files].map((f) => relative(dist, f)), external: [...external], bytes };
}

function entryFile(subpath: string): string {
  const conditions = manifest.exports[subpath];
  if (typeof conditions !== 'object') throw new Error(`no code exports entry for ${subpath}`);
  return resolve(pkgRoot, conditions.import);
}

describe.each(Object.keys(RULES))('entry %s', (subpath) => {
  const rule = RULES[subpath] as EntryRule;
  const graph = walk(entryFile(subpath));

  it('imports only what its rule allows', () => {
    expect(graph.external.sort()).toEqual([...rule.allow].sort());
  });

  it('reaches nothing on its denied list', () => {
    for (const denied of rule.denied) expect(graph.reached).not.toContain(denied);
  });

  it('stays inside its byte budget', () => {
    expect(graph.bytes).toBeLessThanOrEqual(rule.budget);
  });
});

describe('the lock grows with the package', () => {
  it('every published entry point declares a weight rule', () => {
    // Adding `closeout/signal-exit` without a budget here fails, which is the point: a new
    // surface cannot ship until someone has said what it may weigh.
    const code = Object.entries(manifest.exports)
      .filter(([, target]) => typeof target === 'object')
      .map(([subpath]) => subpath);
    expect(code.sort()).toEqual(Object.keys(RULES).sort());
  });

  it('depends on nothing, which is the claim the whole family makes — and exit-hook’s too', () => {
    for (const subpath of Object.keys(RULES)) {
      expect(walk(entryFile(subpath)).external, `${subpath} reaches a package`).toEqual([]);
    }
  });
});
