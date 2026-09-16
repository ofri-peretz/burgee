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

/**
 * **The 2026-09-09 drop is a boundary artifact, not a saving. Read this before quoting it.**
 *
 * `width` and `wrap` moved to `linegauge` (F1), and the numbers below fell hard: `./table`
 * 24,612 -> 3,316, `./boxen` 33,793 -> 12,497, `./log-update` 29,846 -> 8,551, `.` 49,633
 * -> 28,394. **Nothing got lighter.** `walk()` follows relative imports and stops at a bare
 * specifier, so it measures "flagstaff's own dist reached from this entry" — and code that
 * crosses a package boundary leaves that measurement while staying in the program.
 *
 * The number that would show a real change did not move at all. B4 bundles the entry with
 * esbuild, which inlines `linegauge` (`Segmenter` is in the output): `flagstaff/boxen` is
 * 19,531 bytes and 0.301x boxen before the move and after it, to the byte, and the same
 * holds for `ora` and `log-update`. That is the correct answer — the code went to a
 * different file, not away — and it is why B4 is the published claim and this is a lock.
 *
 * The move does cost something, and it is the other direction: `flagstaff` now drags
 * `linegauge` at install, so `installed-bytes` rises. That is Y2's number to state, not
 * this one's to hide.
 *
 * So the budgets came down with the measurements. A ratchet may fall for free and must not
 * rise for free, and leaving them at the old headroom would have handed the next 20 KB of
 * flagstaff a budget that a package boundary paid for.
 */
/**
 * **2026-09-15, Y9.** Five of the measurements below moved, and all five moved for the same
 * reason: `runtime.ts` (81 B) is now the one file in the package that names the process, and
 * the four files that used to name it — `ora`, `boxen`, `log-update` and the `cursor.js` that
 * `./loop` reaches through `projection` — each import it and bind it once. `.` +66,
 * `./loop` +66, `./ora` +41, `./log-update` +76, `./boxen` +137. No budget moved: every one
 * of them was already inside its ratchet and still is. The bytes bought a seam — nothing in
 * this package reads a global any more, so a test substitutes the world by passing an object
 * — and they did not buy a behaviour change: the compatibility rows are 58/99/99/84/6, the
 * same five figures as before.
 */
/**
 * **2026-09-15, the cursor consolidation.** `src/cursor.ts` (1,363 B) is gone and all three
 * surfaces that used it — `ora`, `log-update`, `projection` — now reach `closeout`, which owns
 * `restore-cursor` and `signal-exit` and grades 6/6 against restore-cursor's own suite. Four
 * measurements fell: `.` −1,666, `./loop` −1,666, `./ora` −1,591, `./log-update` −1,591.
 *
 * **Nothing got lighter.** This is the same boundary artifact the 2026-09-09 note warns about,
 * for the same reason: `walk()` stops at a bare specifier, so code that crosses a package
 * boundary leaves this measurement while staying in the program. The deletion is 1,363 B of
 * `cursor.js` plus the `runtime.js` edge the two façades no longer need for it; what replaced
 * it is larger, not smaller, and lives in closeout. The honest direction of travel is the other
 * one — flagstaff now drags `closeout` at install, so `installed-bytes` rises. That is Y2's
 * number to state, not this one's to hide.
 *
 * No budget moved. Every one of the four was already inside its ratchet and is further inside
 * it now, and a ratchet may fall for free. What the bytes bought is one implementation of
 * "put the cursor back however the process dies" instead of three, and a defect fixed on the
 * way: `cursor-net.test.ts` grades the restore the old module's process-wide guard discarded.
 */
/**
 * **2026-09-16, R12 — the hyperlink.** `box` and `table` render a path as a terminal
 * hyperlink, and the sequence is `paratext`'s. Four measurements moved: `.` +2,058,
 * `./box` +1,502, `./table` +1,675, `./cli-table3` +109.
 *
 * Two budgets rose with them — `./box` 18,500 -> 20,000 and `./table` 4,000 -> 6,000 — and
 * this is the comment that makes each a decision rather than drift. The cost is not the OSC
 * 8 implementation, which is not in this package at all: it is `link.js` (1,038 B, the
 * adapter that decides *which runtime* paratext is asked about and what a static projection
 * is defined against) plus the `runtime.js` seam (81 B) that `./table` had no reason to
 * reach before, and about 500 B of `laid`/`painted` threading through each drawing.
 *
 * **Which paratext entry, and what the other one would have cost.** `paratext/link` —
 * 2,410 B across four modules, no registry, no side effect at import. The root is 20,221 B
 * across ten and calls `registerBuiltins()` when it loads, which a package declaring
 * `sideEffects: false` should not be dragging into a bundler's graph. Measured, not assumed:
 * the `walk()` below stops at a bare specifier, so neither figure appears in the numbers in
 * this table — that is exactly the boundary artifact the 2026-09-09 note warns about, and it
 * is why the choice had to be measured in paratext's own `dist/` instead. A 17,811 B
 * difference against a 4,000 B entry was never going to be close, but it was checked.
 *
 * `./cli-table3` keeps its 29,000 and is now 132 B inside it. Deliberately left: the façade
 * is a port of a frozen upstream, so its natural growth is zero, and a ratchet with thin
 * headroom on a file nobody should be adding to is the ratchet working.
 */
const RULES: Record<string, EntryRule> = {
  // Everything: the loop, the registry, and all five built-ins. `box` and `table` bring the
  // wrapper and the width function with them, which is most of it. A program that wants one component should import its subpath (U5, R10).
  '.': { allow: ['closeout', 'closeout/cursor', 'linegauge', 'linegauge/wrap', 'paratext/link', 'roundel/policy', 'roundel/tokens'], budget: 33_000, measured: 31_932, denied: ['cli.js', 'ora.js', 'log-update.js', 'spinners.json'] },
  // The loop and its four projections; never the registry — a program that hoists its own
  // component pays nothing for the plugin host.
  //
  // Raised from 5,000 on 2026-09-08, deliberately: `projection` took on a cursor net, so a
  // Ctrl+C during a frame puts the cursor back instead of leaving the user's terminal without
  // one — a defect neither incumbent has, on the one entry whose whole job is drawing on a
  // terminal. Since 2026-09-15 that net is `closeout`'s, reached by a bare specifier, so the
  // measurement no longer carries it and the budget has more headroom than it needs. Left
  // where it is: what the entry may weigh did not change because a dependency edge moved.
  './loop': { allow: ['closeout', 'closeout/cursor', 'roundel/policy'], budget: 7_000, measured: 4_972, denied: ['plugin.js', 'builtins.js', 'schema.json', 'spinner.js', 'cli.js', 'index.js'] },
  // The registry, the validator, the built-ins and the schema they are checked against.
  // The registry, the validator, the built-ins and the schema they are checked against —
  // which now carries `borders` too, so both this and `./spinner` are larger than before.
  // Measured 10,190 B, of which the schema is 2,978: the contract ships in the tarball (R3).
  './plugin': { allow: [], budget: 16_000, measured: 14_623, denied: ['loop.js', 'projection.js', 'spinner.js', 'cli.js', 'index.js'] },
  // The ceiling is ora (R10). The spinner plus the registry it reads its style from;
  // ora 9.4.1's own index.js is 17,891 B before any of its sixteen dependencies.
  './spinner': { allow: ['roundel/tokens'], budget: 17_000, measured: 15_551, denied: ['loop.js', 'projection.js', 'cli.js', 'index.js'] },
  // The ora façade: the port, the width function and the spinner corpus it re-exports. The
  // cursor control is no longer counted here — it is `closeout`'s since 2026-09-15, and a bare
  // specifier leaves this measurement while staying in the program.
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
  './ora': { allow: ['closeout/cursor', 'closeout/restore-cursor', 'linegauge', 'roundel/chalk'], budget: 43_000, measured: 41_036, denied: ['loop.js', 'projection.js', 'plugin.js', 'builtins.js', 'spinner.js', 'cli.js', 'index.js'] },
  // The log-update façade: the port, the ANSI-aware wrapper and the width function, against
  // log-update's own 113,368 B across sixteen packages (slice-ansi 27,630 · signal-exit 21,983
  // · wrap-ansi 20,004 · the rest). signal-exit's 21,983 B is what `closeout` replaces, shared
  // with `./ora` rather than ported twice — and, since 2026-09-15, owned one package over
  // rather than here.
  //
  // It reaches no package but `linegauge/wrap` and `closeout`. `wrap.ts` carries the SGR close
  // codes itself — they are ECMA-48, not a library's table — which took `roundel/chalk` off it
  // and off `./box` and `./table` with it. It shares the width function with `./ora` and
  // reaches neither the corpus nor the core.
  './log-update': { allow: ['closeout/cursor', 'closeout/restore-cursor', 'linegauge/wrap'], budget: 9_000, measured: 7_036, denied: ['ora.js', 'spinners.json', 'loop.js', 'projection.js', 'plugin.js', 'builtins.js', 'spinner.js', 'cli.js', 'index.js'] },
  // The boxen façade (R10). boxen 8.0.1 is 8 dependencies; this reaches `width.js`,
  // `wrap.js` and `roundel/chalk` — the first two already shipped for `./ora` and
  // `./log-update`, and `ansi-align`, `widest-line`, `camelcase` and `cli-boxes` are a few
  // lines each, written where they are used. Measured 33,664 B on 2026-09-09, and
  // `roundel/chalk` — the only thing it reaches outside the package — is a further 9,311 B,
  // which roundel's own weight lock records at the same figure. **43,104 B in two packages,
  // against boxen 8.0.1's 132,414 B in nineteen — 33%.** It shares `wrap.js` and `width.js`
  // with the other two façades, so a program on two of them pays for both once.
  './boxen': { allow: ['linegauge', 'linegauge/wrap', 'roundel/chalk'], budget: 13_000, measured: 12_634, denied: ['ora.js', 'spinners.json', 'loop.js', 'projection.js', 'plugin.js', 'builtins.js', 'spinner.js', 'cli.js', 'index.js', 'log-update.js'] },
  // The cli-table3 façade (R10). cli-table3 0.6.5 reaches `string-width` and
  // `@colors/colors`; this reaches `width.js` — already here for the other three façades —
  // and `roundel/chalk` for the two default styles. Measured 32,989 B on 2026-09-09 — 45 B
  // more than the port first weighed, which is the two `test/issues/` fixes — and
  // `roundel/chalk` is a further 9,311 B, which roundel's own weight lock records at the
  // same figure. **42,300 B in two packages, against cli-table3 0.6.5's 105,983 B in seven
  // — 40%.** It carries its own wrapping rather than sharing `wrap.js`: cli-table3 splits
  // on `/(\s+)/` and counts with its own `strlen`, which a wrap-ansi port does not
  // reproduce, so sharing would be a divergence dressed up as reuse.
  './cli-table3': { allow: ['linegauge', 'paratext/link', 'roundel/chalk'], budget: 29_000, measured: 28_868, denied: ['ora.js', 'spinners.json', 'boxen.js', 'log-update.js', 'loop.js', 'projection.js', 'plugin.js', 'builtins.js', 'spinner.js', 'cli.js', 'index.js'] },
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
  './progress': { allow: ['roundel/tokens'], budget: 2_000, measured: 971, denied: ['loop.js', 'projection.js', 'plugin.js', 'builtins.js', 'cli.js', 'index.js'] },
  './tasks': { allow: ['roundel/tokens'], budget: 17_000, measured: 15_962, denied: ['loop.js', 'projection.js', 'cli.js', 'index.js'] },
  // `box` reads its named borders from the registry, the way `tasks` reads its glyphs, so
  // it carries the plugin host: 34,145 B, up from 24,764 when the border table was its own.
  // That is the price of R11 — a corpus imported with `fromCliBoxes()` is a registered
  // plugin, and `box('…', { border: 'arrow' })` then draws with it without knowing it
  // exists. A caller who wants neither passes a style object and a bundler drops the rest.
  './box': { allow: ['linegauge', 'linegauge/wrap', 'paratext/link', 'roundel/tokens'], budget: 20_000, measured: 18_784, denied: ['loop.js', 'projection.js', 'table.js', 'ora.js', 'spinners.json', 'cli.js', 'index.js'] },
  './table': { allow: ['linegauge', 'linegauge/wrap', 'paratext/link', 'roundel/tokens'], budget: 6_000, measured: 4_991, denied: ['loop.js', 'projection.js', 'plugin.js', 'builtins.js', 'box.js', 'ora.js', 'spinners.json', 'cli.js', 'index.js'] },
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
/*
 * Five budgets rose on 2026-09-14, and the whole rise is one number: the family plugin
 * schema went 3,451 B -> 6,531 B when paratext's capability shape was folded into it
 * (PLAN 1.1 / D2), and every export reaching the plugin registry inlines it. `./plugin` had
 * 457 B of headroom, so *no* capability schema fits under the old ceiling — the breach is
 * structural, not drift, and each of the five moved by roughly the same 3,080 B.
 *
 * The claims survive it: `./spinner` at 15,551 B is still under ora's 17,891 B.
 *
 * A bigger ceiling is not the better fix. One byte-identical `src/schema.json` is the
 * contract each package *publishes* (plugin-contract R2), but a host only ever validates its
 * own section, so `schema-to-dist.mjs` should project the published file down to the section
 * that host bundles. That is a change in `scripts/`, written down as PLAN 1.8 rather than
 * made here — it is not paratext's to make and not this PR's shape.
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
