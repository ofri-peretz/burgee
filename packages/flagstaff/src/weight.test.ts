/**
 * R8 / U5 — weight is paid per import, never per config, and the ceiling on each subpath
 * is named after the incumbent it replaces: `flagstaff/spinner` may not weigh more than
 * ora, once vendored (R10). Mirrors `roundel/src/weight.test.ts`.
 *
 * This walks the import graph of every entry point in `exports` and asserts what each may
 * reach. The last test is the important one: **an entry point cannot be added without
 * declaring its budget here**, so the lock grows with the package instead of rotting
 * behind it. It reads `dist/`, so it measures what is published rather than what is written.
 */
import { readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const pkgRoot = fileURLToPath(new URL('..', import.meta.url));
const dist = resolve(pkgRoot, 'dist');

interface Manifest {
  exports: Record<string, { import: string }>;
}

// Read rather than import: the published entry list is data here, and a JSON import
// would reach out of src/ for it.
const manifest = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf8')) as Manifest;

interface EntryRule {
  /** Bare specifiers this entry may import: roundel's subpaths and nothing else (R10). */
  allow: string[];
  /** Bytes reachable from it. A ratchet: lowering is free, raising is a decision with a comment. */
  budget: number;
  /** Modules this entry must never reach, whatever else changes. */
  denied: string[];
}

const RULES: Record<string, EntryRule> = {
  // Everything: loop + projection + plugin + builtins + schema + spinner. Measured 13,849 B on
  // 2026-09-08. Depends on roundel's policy and tokens, and on nothing else (R10, U6).
  '.': { allow: ['roundel/policy', 'roundel/tokens'], budget: 16_000, denied: ['cli.js'] },
  // The loop and its four projections; never the registry — a program that hoists its own
  // component pays nothing for the plugin host. Measured 4,401 B on 2026-09-08.
  './loop': { allow: ['roundel/policy'], budget: 5_000, denied: ['plugin.js', 'builtins.js', 'schema.json', 'spinner.js', 'cli.js', 'index.js'] },
  // The registry, the validator, the built-ins and the schema they are checked against.
  // Measured 8,434 B, of which the schema is 2,406: the contract ships in the tarball (R3).
  './plugin': { allow: [], budget: 10_000, denied: ['loop.js', 'projection.js', 'spinner.js', 'cli.js', 'index.js'] },
  // The ceiling is ora (R10). The spinner plus the registry it reads its style from.
  // Measured 9,362 B on 2026-09-08; ora 9.4.1's own index.js is 17,891 B before any of its
  // sixteen dependencies.
  './spinner': { allow: ['roundel/tokens'], budget: 11_000, denied: ['loop.js', 'projection.js', 'cli.js', 'index.js'] },
  // The ora façade: the port, the width function and the spinner corpus it re-exports.
  // Measured 46,330 B on 2026-09-08 (ora.js 21,867 · spinners.json 20,250 · width.js 4,213),
  // and `roundel/chalk` — the only thing it reaches outside the package — is a further
  // 9,311 B (chalk.js 6,053 · policy.js 1,972 · tokens.js 1,286), which roundel's own
  // weight lock records at the same figure. **55,641 B in two packages, against ora 9.4.1's
  // 113,577 B in seventeen — 49%.**
  //
  // The method, so the number reproduces: shipped code and data — `.js`/`.mjs`/`.cjs` plus
  // the `.json` a module imports, `package.json` never counted. Ours is `walk()` below over
  // `dist/`, the graph an import of the subpath actually pulls. ora's is every package that
  // graph touches in ora's own resolved tree — its nested `node_modules` win, so chalk 5.6.2
  // and string-width 8.2.2, not whatever is hoisted — each counted whole (ora 17,891 ·
  // cli-spinners 27,841 · signal-exit 21,983 · chalk 16,727 · get-east-asian-width 8,785 ·
  // string-width 6,194 · yoctocolors 4,466 · mimic-function 3,038 · the other nine 6,652).
  // Counting ora the stricter way — only the 27 files its graph reaches, whole packages
  // ignored — gives 101,809 B, and ours is still 55% of that.
  //
  // It reaches nothing in the core: an ora migration does not drag the frame loop in, and
  // a program that hoists does not pay for the corpus.
  './ora': { allow: ['roundel/chalk'], budget: 50_000, denied: ['loop.js', 'projection.js', 'plugin.js', 'builtins.js', 'spinner.js', 'cli.js', 'index.js'] },
  // The log-update façade: the port, the ANSI-aware wrapper and the width function.
  // Measured 28,606 B on 2026-09-08 (of which `wrap.js` is 17,017), against log-update's
  // own 113,368 B across sixteen packages (slice-ansi 27,630 · signal-exit 21,983 ·
  // wrap-ansi 20,004 · the rest). With `roundel/chalk`'s 18,078 counted it is 46,684 B in
  // two packages, 41% of log-update's. It shares `width.js` with `./ora` and reaches
  // neither the corpus nor the core.
  './log-update': { allow: ['roundel/chalk'], budget: 32_000, denied: ['ora.js', 'spinners.json', 'loop.js', 'projection.js', 'plugin.js', 'builtins.js', 'spinner.js', 'cli.js', 'index.js'] },
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
  if (conditions === undefined) throw new Error(`no exports entry for ${subpath}`);
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
    // Adding `flagstaff/box` without a budget here fails, which is the point: a new
    // surface cannot ship until someone has said what it may weigh.
    expect(Object.keys(manifest.exports).sort()).toEqual(Object.keys(RULES).sort());
  });
});
