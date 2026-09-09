/**
 * U5 — weight is paid per import, never per config, and the ceiling on each subpath is
 * named after the incumbent it replaces. Mirrors `roundel/src/weight.test.ts` and
 * `flagstaff/src/weight.test.ts`.
 *
 * caique was the last published package without one of these, which meant the one package
 * in the family that talks to a person — and to an agent — was the one making an unmeasured
 * claim. This is that gap closed.
 *
 * **The ceiling is clack.** `@clack/prompts` 1.8.0 is 101,684 B across six packages —
 * itself, `@clack/core`, `fast-string-width`, `fast-string-truncated-width`,
 * `fast-wrap-ansi` and `sisteransi` — measured on 2026-09-09 the way every other bill in
 * this repo is: shipped code and data (`.js`/`.mjs`/`.cjs` plus imported `.json`,
 * `package.json` never counted), each package counted whole across its own resolved tree.
 * The whole of caique is 25,627 B and reaches **no package at all**, so the entry that
 * carries everything is a quarter of the incumbent that carries the least.
 *
 * The last test is the important one: **an entry point cannot be added without declaring
 * its budget here**, so the lock grows with the package instead of rotting behind it. It
 * reads `dist/`, so it measures what is published rather than what is written.
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
  /** Bare specifiers this entry may import. Empty everywhere: caique depends on nothing. */
  allow: string[];
  /** Bytes reachable from it. A ratchet: lowering is free, raising is a decision with a comment. */
  budget: number;
  /** Modules this entry must never reach, whatever else changes. */
  denied: string[];
}

const RULES: Record<string, EntryRule> = {
  // Everything, for a program that wants one import: the spec, the decision, both widget
  // modes, the binding and the terminal. Measured 25,627 B on 2026-09-09 — a quarter of
  // clack's 101,684 B across six packages, and caique reaches none.
  '.': { allow: [], budget: 30_000, denied: [] },
  // The shape and its validator. The floor every other subpath stands on, and a leaf: a
  // program that only declares prompts pays 1,571 B and never loads a widget.
  './spec': { allow: [], budget: 2_500, denied: ['ask.js', 'decide.js', 'raw.js', 'binding.js', 'terminal.js', 'index.js'] },
  // The rule that decides whether a person can be asked at all — the file that keeps a CLI
  // from hanging under an agent. It reaches only the spec, never a widget: deciding not to
  // ask must not cost the machinery of asking. Measured 4,986 B.
  './decide': { allow: [], budget: 6_000, denied: ['ask.js', 'raw.js', 'binding.js', 'terminal.js', 'index.js'] },
  // The six widgets in line mode (R5), which is the floor and the accessible rendering.
  // Measured 8,564 B — the whole prompt surface, with no terminal and no raw mode.
  './ask': { allow: [], budget: 10_000, denied: ['decide.js', 'raw.js', 'binding.js', 'terminal.js', 'index.js'] },
  // The raw-mode renderer sits *on top of* line mode and answers the same questions, so it
  // carries `ask.js` by design — that shared answer is the arrangement, not an accident.
  // It never reaches the terminal: a caller supplies its own streams. Measured 14,796 B.
  './raw': { allow: [], budget: 17_000, denied: ['decide.js', 'binding.js', 'terminal.js', 'index.js'] },
  // Resolving a whole command's prompts in one pass: the decision plus the widgets it may
  // reach for. Never the terminal, and never the raw renderer — a framework hands caique an
  // `Io`, and which one is the caller's business. Measured 15,475 B.
  './binding': { allow: [], budget: 18_000, denied: ['raw.js', 'terminal.js', 'index.js'] },
  // The only file that touches a stream, and the only one that knows what echo is. It
  // carries `ask.js` for the `Io` shape it implements. Measured 11,975 B.
  './terminal': { allow: [], budget: 14_000, denied: ['decide.js', 'raw.js', 'binding.js', 'index.js'] },
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
    // Adding `caique/inquirer` without a budget here fails, which is the point: a new
    // surface cannot ship until someone has said what it may weigh.
    const code = Object.entries(manifest.exports)
      .filter(([, target]) => typeof target === 'object')
      .map(([subpath]) => subpath);
    expect(code.sort()).toEqual(Object.keys(RULES).sort());
  });

  it('depends on nothing, which is the claim the whole family makes', () => {
    for (const subpath of Object.keys(RULES)) {
      expect(walk(entryFile(subpath)).external, `${subpath} reaches a package`).toEqual([]);
    }
  });
});
