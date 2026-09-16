/**
 * R8 / U5 — weight is paid per import, never per config, and the ceiling on each subpath
 * is named after the incumbent it replaces: `roundel/tokens` may not weigh more than
 * picocolors (3.3 KB). Mirrors `burgee/src/weight.test.ts`.
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
  exports: Record<string, { import: string } | string>;
}

// Read rather than import: the published entry list is data here, and a JSON import
// would reach out of src/ for it.
const manifest = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf8')) as Manifest;

interface EntryRule {
  /** Bare specifiers this entry may import. Nothing, for every entry: the package depends on nothing. */
  allow: string[];
  /** Bytes reachable from it. A ratchet: lowering is free, raising is a decision with a comment. */
  budget: number;
  /** Modules this entry must never reach, whatever else changes. */
  denied: string[];
}

const RULES: Record<string, EntryRule> = {
  // Everything, for a program that wants one import. Measured 6,565 B on 2026-09-08 for
  // policy + tokens + theme + contrast; the budget leaves room for the chalk façade's entry
  // in the re-export list, not for the façade itself, which will be its own row.
  // 13,700 on 2026-09-13: the root reaches the theme, so it carries all 1,924 B of the
  // colour work above. Measured 13,639. Unlike `./theme` this entry was inside its budget on
  // `main`, so the whole of this raise is this branch's.
  // 14,600 on 2026-09-13: the root reaches the theme, so it carries `audit()` too.
  // Measured 14,578.
  '.': { allow: [], budget: 14_600, denied: [] },
  // The floor every subpath stands on: two functions and one record. node:util alone.
  // R2's 2026-09-08 revision added the `--color` flags and the CI vendor table here, which
  // is why the file's level tables are ternary chains, and why `colorLevel`'s own decision
  // table is one line (see the eslint override that names this): measured 1,972 B on
  // 2026-09-08 after the chalk-parity pass — `COLORTERM=24bit` and `--color=24bit` were both
  // roundel inventions supports-color does not have, and dropping them paid for the
  // `FORCE_COLOR=0`, `--colors` and accessible rows. No budget in this file moved, and
  // `./tokens` and `./chalk` below both still fit under the incumbents they are named for.
  './policy': { allow: [], budget: 2_000, denied: ['tokens.js', 'theme.js', 'contrast.js', 'index.js'] },
  // The ceiling is picocolors: 3.3 KB. Tokens plus the policy they read, and nothing else —
  // a program that imports nine functions must never carry the theme or the maths.
  './tokens': { allow: [], budget: 3_300, denied: ['theme.js', 'contrast.js', 'index.js'] },
  // The theme carries the contrast check (R5); it never carries the tokens. Raised from
  // 6,000 on 2026-09-08: R2's revision grew the policy every subpath stands on, and the
  // theme reaches it. Measured 6,271 B; the ceiling is the next hundred above that. The
  // theme is the one entry with no incumbent to be measured against, so it is the one that
  // moves — `./tokens` (picocolors) and `./chalk` (chalk) did not.
  // The plugin host. Its only import is a type, erased, so it reaches *nothing* — the file
  // that lets a third party ship a theme is a leaf. Measured 2,812 B on 2026-09-08, most of
  // it the refusal messages: a plugin that cannot contribute is told which token it misspelt
  // and what the nine are, which is worth more bytes than it costs.
  './plugin': { allow: [], budget: 3_000, denied: ['policy.js', 'tokens.js', 'theme.js', 'contrast.js', 'index.js'] },
  //
  // 9,300 on 2026-09-13, and the raise has **two** components that must not be conflated:
  //
  //   6,271 -> 7,320   not this branch. Something grew the theme graph by 1,049 B after
  //                    2026-09-08 without touching the note above or this number, so `main`
  //                    sits 1,020 B over a 6,300 budget **with a green Quality Gate** —
  //                    reproduced on a clean `rm -rf dist` build. A breached budget that CI
  //                    does not fail is not a budget, and that is the larger finding here.
  //   7,320 -> 9,244   this branch: `rgb256` (the palette inverse), `toOklab`, the
  //                    constrained `degrade` search, and the AA/AAA floor. 1,924 B.
  //
  // What the 1,924 buys, measured: a hex that reads at truecolor now also reads at 256 —
  // 167 hexes in the sRGB sweep did not — and `#0d9460` degrades at dE 0.0627 rather than
  // 0.0842. The ceiling is the next hundred above 9,244.
  // 10,200 on 2026-09-13: `audit()`. It is not new arithmetic — `fly()` is now a filter over
  // it rather than a second copy of the same judgement — but it returns rows where `fly()`
  // returned strings, and the rows are the surface a caller reads. Measured 10,183.
  './theme': { allow: [], budget: 10_200, denied: ['tokens.js', 'index.js'] },
  // Pure arithmetic over hex strings. Reaches nothing.
  // 2,100 on 2026-09-13: `reportTheme` and the `ThemeFinding` shape. A report is strings —
  // padding, labels, the line that says "nothing to check" rather than printing an empty
  // report — and strings are most of the 511 B. The alternative was a package that can refuse
  // a theme and cannot tell you why, which is the half that was missing. Measured 2,011.
  './contrast': { allow: [], budget: 2_100, denied: ['policy.js', 'tokens.js', 'theme.js', 'index.js'] },
  // The ceiling is chalk 6.0.0 itself (R8): `wc -c node_modules/chalk/source/*.js` inside
  // compat-oracle reads 8,183 (index.js) + 1,187 (utilities.js) = 9,370 bytes on 2026-09-08,
  // before its vendored ansi-styles and supports-color, which it also ships. The façade plus
  // the tokens' emitter and the policy it reads must fit under that. The other half of R8
  // — a spawn delta no larger than picocolors' — is a `cli-benchmarks` B4 row, not a byte
  // count, and is measured there. Never the theme or the maths: chalk has no theme.
  //
  // **Measured 9,367 B on 2026-09-15, and the budget did not move.** Y9 put the guarded
  // `globalThis.process` cast behind `runtime.js`, which is a fourth module in this graph
  // (chalk.js 5,920 · policy.js 1,972 · tokens.js 1,286 · runtime.js 189) where there were
  // three: +189 B of new file against −133 B out of `chalk.js`, so +56 net against 59 B of
  // headroom. **Three bytes are left.** That is stated rather than smoothed over, because a
  // ratchet this tight will stop the next change to any of these four files, and the right
  // answer then is to find the bytes — the ceiling is chalk 6.0.0's own source and a raise
  // would be the claim getting weaker, not the package getting better.
  './chalk': { allow: [], budget: 9_370, denied: ['theme.js', 'contrast.js', 'index.js'] },
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

/**
 * Exports that are data rather than code: the plugin schema a plugin author reads. No import
 * graph and no budget — the file *is* the payload — so a byte rule would measure nothing.
 * Listed rather than pattern-matched so that adding one is still a decision somebody made.
 */
const DATA_EXPORTS = ['./schema.json'];

describe('the lock grows with the package', () => {
  it('every published entry point declares a weight rule', () => {
    // Adding `roundel/chalk` without a budget here fails, which is the point: a new
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
