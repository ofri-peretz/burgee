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
  // Everything: the loop, the registry, and all five built-ins. `box` and `table` bring the
  // wrapper and the width function with them, which is most of it. Measured 44,294 B on
  // 2026-09-08 — a program that wants one component should import its subpath (U5, R10).
  '.': { allow: ['roundel/chalk', 'roundel/policy', 'roundel/tokens'], budget: 50_000, denied: ['cli.js', 'ora.js', 'log-update.js', 'spinners.json'] },
  // The loop and its four projections; never the registry — a program that hoists its own
  // component pays nothing for the plugin host. Measured 4,141 B.
  './loop': { allow: ['roundel/policy'], budget: 5_000, denied: ['plugin.js', 'builtins.js', 'schema.json', 'spinner.js', 'cli.js', 'index.js'] },
  // The registry, the validator, the built-ins and the schema they are checked against.
  // Measured 10,322 B, of which the schema is 2,978: the contract ships in the tarball (R3).
  './plugin': { allow: [], budget: 12_000, denied: ['loop.js', 'projection.js', 'spinner.js', 'cli.js', 'index.js'] },
  // The ceiling is ora (R10): recorded when ora's suite is vendored. Until then, the spinner
  // plus the registry it reads its style from. Measured 10,015 B; ora 9's own index.js is
  // 9,656 B before its eleven dependencies. Measured 11,250 B.
  './spinner': { allow: ['roundel/tokens'], budget: 12_500, denied: ['loop.js', 'projection.js', 'cli.js', 'index.js'] },
  // The ora façade: the port, the width function and the spinner corpus it re-exports.
  // Measured 45,549 B on 2026-09-08, of which the corpus is 20,250 — and the ceiling it is
  // measured against is ora's own shipped JavaScript, 112,688 B across seventeen packages
  // (ora 17,891 · chalk 21,417 · cli-spinners 27,841 · signal-exit 21,983 · the rest).
  // With `roundel/chalk`'s 18,078 counted it is 63,627 B in two packages, 56% of ora's.
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
  // The four remaining built-ins (R4). `progress` is arithmetic and a token — 971 B, and it
  // reaches nothing, not even the registry. `tasks` reads its glyphs and its spinner style
  // from the registry, so it carries the plugin host: 9,773 B. `box` and `table` are string
  // functions over the wrapper and the width function (R7), which is 21 KB of the ~24.6 KB
  // each; they share both modules, so a program that imports the two pays for them once.
  // None of the four reaches the loop, the façades or the corpus.
  // The corpus importers (R11). 838 B and it reaches *nothing* — its only imports are
  // types, which `verbatimModuleSyntax` erases, so the file that turns ~80 spinners into a
  // plugin costs less than one of them. The corpora themselves are the caller's (U5), and
  // the last case in `import.test.ts` asserts neither became a dependency.
  './import': { allow: [], budget: 2_000, denied: ['plugin.js', 'builtins.js', 'schema.json', 'loop.js', 'projection.js', 'box.js', 'spinner.js', 'cli.js', 'index.js'] },
  './progress': { allow: ['roundel/tokens'], budget: 2_000, denied: ['loop.js', 'projection.js', 'plugin.js', 'builtins.js', 'wrap.js', 'width.js', 'cli.js', 'index.js'] },
  './tasks': { allow: ['roundel/tokens'], budget: 13_000, denied: ['loop.js', 'projection.js', 'wrap.js', 'width.js', 'cli.js', 'index.js'] },
  // `box` reads its named borders from the registry, the way `tasks` reads its glyphs, so
  // it carries the plugin host: 34,223 B, up from 24,710 when the border table was its own.
  // That is the price of R11 — a corpus imported with `fromCliBoxes()` is a registered
  // plugin, and `box('…', { border: 'arrow' })` then draws with it without knowing it
  // exists. A caller who wants neither passes a style object and a bundler drops the rest.
  './box': { allow: ['roundel/chalk', 'roundel/tokens'], budget: 36_000, denied: ['loop.js', 'projection.js', 'table.js', 'ora.js', 'spinners.json', 'cli.js', 'index.js'] },
  './table': { allow: ['roundel/chalk', 'roundel/tokens'], budget: 27_000, denied: ['loop.js', 'projection.js', 'plugin.js', 'builtins.js', 'box.js', 'ora.js', 'spinners.json', 'cli.js', 'index.js'] },
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
