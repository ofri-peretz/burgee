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
  /**
   * What it actually weighed when this line was last touched. Recorded as data and asserted
   * below, not written in prose: the two figures that used to live in comments here drifted
   * twice — 44,294 against a real 49,633 by the time anyone looked — because nothing read
   * them. Headroom against the budget is the useful number, and a stale one is worse than
   * none, so it is checked.
   */
  measured: number;
  /** Modules this entry must never reach, whatever else changes. */
  denied: string[];
}

const RULES: Record<string, EntryRule> = {
  // Everything: the loop, the registry, and all five built-ins. `box` and `table` bring the
  // wrapper and the width function with them, which is most of it. A program that wants one component should import its subpath (U5, R10).
  '.': { allow: ['roundel/policy', 'roundel/tokens'], budget: 50_000, measured: 49_633, denied: ['cli.js', 'ora.js', 'log-update.js', 'spinners.json'] },
  // The loop and its four projections; never the registry — a program that hoists its own
  // component pays nothing for the plugin host.
  //
  // Raised from 5,000 the same day, deliberately: `projection` now reaches `cursor.js`, so a
  // Ctrl+C during a frame puts the cursor back instead of leaving the user's terminal without
  // one. That is ~2.1 KB against a defect neither incumbent has — ora and log-update both
  // reach cli-cursor → restore-cursor → signal-exit — on the one entry whose whole job is
  // drawing on a terminal. The alternative was a third copy of a subtle implementation.
  './loop': { allow: ['roundel/policy'], budget: 7_000, measured: 6_572, denied: ['plugin.js', 'builtins.js', 'schema.json', 'spinner.js', 'cli.js', 'index.js'] },
  // The registry, the validator, the built-ins and the schema they are checked against.
  // The registry, the validator, the built-ins and the schema they are checked against —
  // which now carries `borders` too, so both this and `./spinner` are larger than before.
  // Measured 10,190 B, of which the schema is 2,978: the contract ships in the tarball (R3).
  './plugin': { allow: [], budget: 12_000, measured: 11_490, denied: ['loop.js', 'projection.js', 'spinner.js', 'cli.js', 'index.js'] },
  // The ceiling is ora (R10). The spinner plus the registry it reads its style from;
  // ora 9.4.1's own index.js is 17,891 B before any of its sixteen dependencies.
  './spinner': { allow: ['roundel/tokens'], budget: 12_500, measured: 12_418, denied: ['loop.js', 'projection.js', 'cli.js', 'index.js'] },
  // The ora façade: the port, the width function, the cursor control and the spinner corpus
  // it re-exports. Measured 46,543 B on 2026-09-08 (ora.js 20,701 · spinners.json 20,250 ·
  // width.js 4,229 · cursor.js 1,363 — the cursor control moved out to its own module when
  // `./log-update` came to need the same one; that cost 213 B of module boilerplate and
  // removed the second copy that would otherwise have to stay correct),
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
  './ora': { allow: ['roundel/chalk'], budget: 50_000, measured: 46_816, denied: ['loop.js', 'projection.js', 'plugin.js', 'builtins.js', 'spinner.js', 'cli.js', 'index.js'] },
  // The log-update façade: the port, the ANSI-aware wrapper, the width function and the
  // cursor control. Measured 29,573 B on 2026-09-08 (wrap.js 17,071 · log-update.js 6,910 ·
  // width.js 4,229 · cursor.js 1,363), against log-update's own 113,368 B across sixteen
  // packages (slice-ansi 27,630 · signal-exit 21,983 · wrap-ansi 20,004 · the rest).
  // `cursor.js` is the 1,363 B that replaces signal-exit's 21,983, and it is shared with
  // `./ora` rather than ported twice.
  //
  // `allow` is empty, and that is the number worth reading: this subpath reaches **no
  // package at all**, not even roundel. `wrap.ts` carries the SGR close codes itself —
  // they are ECMA-48, not a library's table — which took `roundel/chalk` off it and off
  // `./box` and `./table` with it. Sixteen packages become none, at a quarter of the
  // bytes. It shares `cursor.js` and `width.js` with `./ora` and reaches neither the corpus
  // nor the core.
  './log-update': { allow: [], budget: 32_000, measured: 29_846, denied: ['ora.js', 'spinners.json', 'loop.js', 'projection.js', 'plugin.js', 'builtins.js', 'spinner.js', 'cli.js', 'index.js'] },
  // The boxen façade (R10). boxen 8.0.1 is 8 dependencies; this reaches `width.js`,
  // `wrap.js` and `roundel/chalk` — the first two already shipped for `./ora` and
  // `./log-update`, and `ansi-align`, `widest-line`, `camelcase` and `cli-boxes` are a few
  // lines each, written where they are used. Measured 33,664 B on 2026-09-09, and
  // `roundel/chalk` — the only thing it reaches outside the package — is a further 9,311 B,
  // which roundel's own weight lock records at the same figure. **42,975 B in two packages,
  // against boxen 8.0.1's 151,351 B in fourteen — 28%.** It shares `wrap.js` and `width.js`
  // with the other two façades, so a program on two of them pays for both once.
  './boxen': { allow: ['roundel/chalk'], budget: 35_000, measured: 33_793, denied: ['ora.js', 'spinners.json', 'loop.js', 'projection.js', 'plugin.js', 'builtins.js', 'spinner.js', 'cli.js', 'index.js', 'log-update.js'] },
  // The four remaining built-ins (R4). `progress` is arithmetic and a token — 971 B, and it
  // reaches nothing, not even the registry. `tasks` reads its glyphs and its spinner style
  // from the registry, so it carries the plugin host: 9,773 B. `box` and `table` are string
  // functions over the wrapper and the width function (R7), which is most of each; they
  // share both modules, so a program that imports the two pays for them once. Neither
  // reaches a package: `wrap.ts` carries its own SGR table.
  // None of the four reaches the loop, the façades or the corpus.
  // The corpus importers (R11). 838 B and it reaches *nothing* — its only imports are
  // types, which `verbatimModuleSyntax` erases, so the file that turns ~80 spinners into a
  // plugin costs less than one of them. The corpora themselves are the caller's (U5), and
  // the last case in `import.test.ts` asserts neither became a dependency.
  './import': { allow: [], budget: 2_000, measured: 838, denied: ['plugin.js', 'builtins.js', 'schema.json', 'loop.js', 'projection.js', 'box.js', 'spinner.js', 'cli.js', 'index.js'] },
  './progress': { allow: ['roundel/tokens'], budget: 2_000, measured: 971, denied: ['loop.js', 'projection.js', 'plugin.js', 'builtins.js', 'wrap.js', 'width.js', 'cli.js', 'index.js'] },
  './tasks': { allow: ['roundel/tokens'], budget: 13_000, measured: 12_829, denied: ['loop.js', 'projection.js', 'wrap.js', 'width.js', 'cli.js', 'index.js'] },
  // `box` reads its named borders from the registry, the way `tasks` reads its glyphs, so
  // it carries the plugin host: 34,145 B, up from 24,764 when the border table was its own.
  // That is the price of R11 — a corpus imported with `fromCliBoxes()` is a registered
  // plugin, and `box('…', { border: 'arrow' })` then draws with it without knowing it
  // exists. A caller who wants neither passes a style object and a bundler drops the rest.
  './box': { allow: ['roundel/tokens'], budget: 36_000, measured: 35_445, denied: ['loop.js', 'projection.js', 'table.js', 'ora.js', 'spinners.json', 'cli.js', 'index.js'] },
  './table': { allow: ['roundel/tokens'], budget: 27_000, measured: 24_612, denied: ['loop.js', 'projection.js', 'plugin.js', 'builtins.js', 'box.js', 'ora.js', 'spinners.json', 'cli.js', 'index.js'] },
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

  /**
   * The recorded weight has to still be the real one. Within 2% so ordinary edits do not
   * churn the table, and far tighter than the drift that made this necessary (12%). If this
   * fails, put the number the run reports into `measured` — that is the whole fix.
   */
  it('records what it actually weighs', () => {
    expect(Math.abs(graph.bytes - rule.measured) / rule.measured).toBeLessThan(0.02);
  });
});

it('every entry records a measurement — otherwise the check above asserts nothing', () => {
  const entries = Object.entries(RULES);
  expect(entries.length).toBeGreaterThan(0);
  expect(entries.filter(([, r]) => typeof r.measured !== 'number').map(([k]) => k)).toEqual([]);
});

/**
 * Exports that are data rather than code. They have no import graph and no budget — the
 * file *is* the payload — so a byte rule would measure nothing. They are listed rather than
 * pattern-matched so that adding one is still a decision somebody made on purpose.
 */
const DATA_EXPORTS = ['./schema.json'];

describe('the lock grows with the package', () => {
  it('every published entry point declares a weight rule', () => {
    // Adding `flagstaff/box` without a budget here fails, which is the point: a new
    // surface cannot ship until someone has said what it may weigh.
    const code = Object.keys(manifest.exports).filter((e) => !DATA_EXPORTS.includes(e));
    expect(code.sort()).toEqual(Object.keys(RULES).sort());
  });

  it('every data export is named here, so one cannot arrive without a decision', () => {
    const data = Object.entries(manifest.exports)
      .filter(([, target]) => typeof target === 'string')
      .map(([subpath]) => subpath);
    expect(data.sort()).toEqual([...DATA_EXPORTS].sort());
  });
});
