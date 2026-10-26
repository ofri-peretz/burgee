/**
 * Lock — every published subpath has a weight on the page, and the page is generated.
 *
 * `/docs/weight` is the only place a reader can find out what `flagstaff/progress` or
 * `caique/decide` or `seniority/find-up` costs them. B4 covers fifteen *pairs*, each of ours
 * against the package it replaces, which is the right shape for a claim and covers fifteen of
 * the seventy-seven code subpaths this repository publishes. The other sixty-two had no number
 * anywhere, and the per-package weight locks measure the on-disk static graph, which is a
 * different quantity from what a bundler puts in an application.
 *
 * So: adding an entry point means the page grows with it. A subpath published and unmeasured is
 * a surface nobody has priced, and it is exactly how `flagstaff` came to publish thirteen.
 *
 * The `--check` half is `subpath-weight.ts`'s own, run by compat.yml's required `ratchet` job
 * after its build: it regenerates into memory and exits non-zero when any line but the
 * generation stamp differs, which is what makes *do not edit by hand* true rather than
 * aspirational. This file checks the cheaper, more important property — that
 * nothing is *missing* — because a stale number is visible and an absent row is not.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PAGE = join(REPO_ROOT, 'apps/docs/content/docs/weight.mdx');

interface Manifest {
  name: string;
  private?: boolean;
  exports?: Record<string, unknown>;
}

function published(): string[] {
  const out: string[] = [];
  for (const dir of readdirSync(join(REPO_ROOT, 'packages'))) {
    let manifest: Manifest;
    try {
      manifest = JSON.parse(readFileSync(join(REPO_ROOT, 'packages', dir, 'package.json'), 'utf8')) as Manifest;
    } catch {
      continue;
    }
    if (manifest.private === true) continue;
    for (const subpath of Object.keys(manifest.exports ?? {})) {
      if (subpath.endsWith('.json')) continue;
      out.push(subpath === '.' ? manifest.name : `${manifest.name}/${subpath.slice(2)}`);
    }
  }
  return out;
}

/**
 * `graded-override-targets` R3–R7 (U5): a drop-in façade weighs no more than the incumbent it
 * replaces, read from the page's own "Everything" column.
 *
 * The incumbent's side is a recorded measurement, not a live one: the graded release is not what
 * the workspace hoists for `onetime` (7 here, 8 graded), and installing six incumbents to measure
 * them would put six packages in a lockfile for a number. Each is the page's own method applied
 * to the incumbent at its graded version — `export * from X`, plus `export { default } from X`
 * when X has one, through `esbuild --bundle --minify --format=esm --platform=node` — taken
 * 2026-10-11 from a scratch install of exactly that version. A re-vendor moves the version in
 * `GRADED_VERSIONS`, and the row below must be re-measured with it.
 */
const DROP_IN_CEILINGS: Readonly<Record<string, { incumbent: string; bytes: number }>> = {
  'closeout/onetime': { incumbent: 'onetime@8.0.0', bytes: 1_527 },
  'closeout/cli-cursor': { incumbent: 'cli-cursor@5.0.0', bytes: 4_757 },
  'linegauge/cli-truncate': { incumbent: 'cli-truncate@6.1.1', bytes: 20_675 },
  'linegauge/widest-line': { incumbent: 'widest-line@6.0.0', bytes: 6_079 },
  // `colour-facades` R4: colorette 2.0.20 by the same method (`export *` alone: it has no
  // default), measured 2026-10-20. Over this, `roundel/colorette` does not ship (the spec's kill criterion).
  'roundel/colorette': { incumbent: 'colorette@2.0.20', bytes: 2_602 },
  // R7's kill criterion: over this, `roundel/picocolors` does not publish.
  'roundel/picocolors': { incumbent: 'picocolors@1.1.1', bytes: 2_739 },
  // `supports-color-drop-in` R4: supports-color 11.0.0 by the same method, measured 2026-10-19.
  'roundel/supports-color': { incumbent: 'supports-color@11.0.0', bytes: 2_145 },
  // `colour-facades` R4: yoctocolors 2.2.0 by the same method, measured 2026-10-20. Over this,
  // `roundel/yoctocolors` does not ship (the spec's kill criterion).
  'roundel/yoctocolors': { incumbent: 'yoctocolors@2.2.0', bytes: 3_395 },
  // `inquirer-prompts-drop-in` R5: `@inquirer/prompts` 8.7.3 with the ten prompt releases it
  // shipped with and `@inquirer/core` 12.0.4 (the graded tree, D-20261019-inquirer-prompts-pins-its-prompts),
  // by the same method, measured 2026-10-20. iconv-lite's tables, through `@inquirer/editor`, are most of it.
  'caique/inquirer/prompts': { incumbent: '@inquirer/prompts@8.7.3', bytes: 582_754 },
  // `previous-majors` R3: 17's `yargs/yargs` — `yargs.mjs` over its CommonJS build — measured
  // 2026-10-19 from yargs 17.7.3 as `compat-oracle` installs it (D-20261019-yargs-17-budget).
  'burgee/yargs/v17/yargs': { incumbent: 'yargs@17.7.3 (yargs/yargs)', bytes: 114_656 },
};

/**
 * A drop-in that bundles **heavier** than what a user installs today, priced against it and named
 * rather than left off the comparison. The same method as {@link DROP_IN_CEILINGS}.
 *
 * `ours` is a ratchet, not a budget: the latest measurement, which the façade may not grow past and
 * which each change that shrinks it lowers. The row leaves this table for `DROP_IN_CEILINGS` the day
 * it weighs no more than the incumbent, and the last assertion below fails until it does. `gap` is
 * the ledger file that says why the row is over and what closing it takes.
 *
 * `burgee/commander` (commander-front-end-diet R4): 61,207 at `10edb48` and 61,272 once #1064 grew `schema.js`; 56,418 after R1, 55,661 after R2,
 * 55,653 on 2026-10-19 (D-20261019-lighter-than-commander-ratchet): the page read 55,648 after #1083 and #1091, and #1139 added
 * 5 B to all three commander entries without regenerating the page, so v14 moves with them, 55,997 -> 56,002. Every
 * byte over commander is named in that spec's residual table. 55,595 on 2026-10-20 (D-20261020-default-command-weight):
 * `--schema` passes `default` through, and `optionProperty` copies four keys in one loop, -58 B on every façade row.
 * v14 56,002 -> 55,944, `burgee/yargs/v17` 110,312 -> 110,254. 55,601 on 2026-10-25
 * (D-20261025-commander-env-v2-facade-weight): `env` joins the keys `optionProperty` copies, so an MCP
 * client sees an option's variable, +6 B on every façade row; v14 55,950, `burgee/yargs/v17` 110,260.
 */
const OVER_INCUMBENT: Readonly<Record<string, { incumbent: string; bytes: number; ours: number; gap: string }>> = {
  'burgee/commander': { incumbent: 'commander@15.0.0', bytes: 39_329, ours: 55_601, gap: 'B-20261012-commander-front-end-bundles-heavier' },
  // `extra-typings-drop-in` R5: `export * from '../commander.js'`, so it bundles to `burgee/commander`
  // byte for byte and its ratchet moves with that row.
  'burgee/commander/extra-typings': { incumbent: '@commander-js/extra-typings@15.0.0 + commander@15.0.0', bytes: 39_329, ours: 55_601, gap: 'B-20261012-extra-typings-bundles-heavier' },
  // `previous-majors` R1: `burgee/commander` plus one subclass with commander 14's excess-arguments
  // message, so it bundles `burgee/commander`'s bytes plus 349, and its ratchet moves with that row.
  // commander 14.0.3 measured 2026-10-12 by the same method: 40,970 B (D-20261012-commander-14-budget).
  'burgee/commander/v14': { incumbent: 'commander@14.0.3', bytes: 40_970, ours: 55_950, gap: 'B-20261012-commander-front-end-bundles-heavier' },
  // `previous-majors` R3: `burgee/yargs` plus 17's string table and `commandDir()` walk. yargs
  // 17.7.3's `index.mjs` bundles to 84,475 B by the same method, measured 2026-10-19, and yargs
  // 18.2.0's to 111,698 B, which `burgee/yargs` is under (D-20261019-yargs-17-budget).
  'burgee/yargs/v17': { incumbent: 'yargs@17.7.3', bytes: 84_475, ours: 110_260, gap: 'B-20261019-yargs-17-entry-bundles-heavier' },
};

/** The "Everything" cell of a subpath's row on the page, or `undefined` when it has no row. */
const everything = (page: string, specifier: string): number | undefined => {
  const cell = new RegExp(String.raw`^\| \`${specifier.replaceAll('/', '\\/')}\` \|.*\| ([\d,]+) \|$`, 'm').exec(page)?.[1];
  return cell === undefined ? undefined : Number(cell.replaceAll(',', ''));
};

describe('a drop-in façade weighs no more than its incumbent (U5)', () => {
  const page = readFileSync(PAGE, 'utf8');

  it.each(Object.entries(DROP_IN_CEILINGS))('%s, against %o', (specifier, { bytes }) => {
    const ours = everything(page, specifier);
    expect(ours, `\`${specifier}\` has no row on /docs/weight`).toBeDefined();
    expect(ours, `\`${specifier}\` bundles ${String(ours)} B, over the incumbent's ${String(bytes)} B`).toBeLessThanOrEqual(bytes);
  });

  it.each(Object.entries(OVER_INCUMBENT))('%s, over its incumbent, does not grow past %o', (specifier, { bytes, ours, gap }) => {
    const measured = everything(page, specifier);
    expect(measured, `\`${specifier}\` has no row on /docs/weight`).toBeDefined();
    expect(measured, `\`${specifier}\` bundles ${String(measured)} B, over the ${String(ours)} B its ratchet holds`).toBeLessThanOrEqual(ours);
    expect(existsSync(join(REPO_ROOT, '.sdlc/gaps', `${gap}.md`)), `${gap} names no file in .sdlc/gaps`).toBe(true);
    expect(measured, `\`${specifier}\` is at or under the incumbent's ${String(bytes)} B now: move it to DROP_IN_CEILINGS and close ${gap}`).toBeGreaterThan(bytes);
  });

  it('reads the Everything column, the last cell of the row', () => {
    expect(everything('| `a/b` | 1 | `default` 724 | `default` 724 | 1,716 |\n', 'a/b')).toBe(1716);
    expect(everything('| `a/b` | 1 | x | y | 9 |\n', 'a/c')).toBeUndefined();
  });
});

describe('the per-subpath weight page', () => {
  const page = readFileSync(PAGE, 'utf8');
  const specifiers = published();

  it('finds subpaths to check, so a broken reader cannot make this gate vacuous', () => {
    expect(specifiers.length, 'no published subpaths were found — the reader is broken, not the repo').toBeGreaterThan(50);
  });

  it.each(specifiers)('prices %s', (specifier) => {
    expect(page, `\`${specifier}\` is published and has no row on /docs/weight. Run \`npm run weight:page\` and commit it.`).toContain(`| \`${specifier}\` |`);
  });

  it('says it is generated, so nobody edits it by hand', () => {
    expect(page).toContain('Do not edit by hand');
  });

  /**
   * The age of the stamp, beside the content check.
   *
   * Every measured line is compared with the build by `npm run weight:page -- --check` in
   * compat.yml's `ratchet` job (the describe block at the end of this file holds that). Before
   * that check ran anywhere, this window was the page's only freshness gate, and it let #1139's
   * 5 B through. It stays, because a page regenerated by nobody for a month is worth a second
   * look even when the build happens to agree with it.
   */
  it('was regenerated recently enough to be worth reading', () => {
    const stamp = /Generated (\d{4}-\d{2}-\d{2}) at commit/.exec(page)?.[1];
    expect(stamp, 'the page carries no generation date, so nothing can tell whether its numbers are current').toBeDefined();
    const ageDays = (Date.now() - Date.parse(stamp ?? '')) / 86_400_000;
    expect(
      ageDays,
      `/docs/weight was generated ${ageDays.toFixed(1)} days ago. Every number on it comes from \`dist/\` at that ` +
        `commit, so a page this old is pricing a package that has since changed. Run \`npm run weight:page\`.`,
    ).toBeLessThanOrEqual(14);
  });

  /**
   * A row of `0` is the failure mode this page already had: `export *` does not re-export
   * `default`, so a module whose only export is a default measured its whole-surface column as
   * **0 bytes** — `burgee/meow`, the largest façade in the package, reading as free.
   */
  it('prices nothing at zero', () => {
    const zeros = [...page.matchAll(/^\| `([^`]+)` \|.*\| 0 \|$/gm)].map((m) => m[1]);
    expect(zeros, 'a subpath measured 0 bytes, which is a hole in the instrument rather than a very small module').toEqual([]);
  });
});

/**
 * The page matches the build, not just the list of subpaths. `npm run weight:page -- --check`
 * runs after the build in compat.yml's required `ratchet` job; this holds what it compares.
 * #1139 added 5 B to every commander entry and the page kept the old numbers: `burgee/commander/v14`
 * sat at 56,002 B against a page and a ratchet of 55,997, and nothing failed.
 */
/** A one-row weight page, stamped. */
const stampedPage = (stamp: string, cell: string): string => `title\n\nGenerated ${stamp} at commit \`abc1234\`.\n\n| \`burgee/commander/v14\` | 14 | x | y | ${cell} |\n`;

describe('the weight page check compares every measured line and only the stamp is free', () => {

  it('passes a page whose only difference is the date and commit it was taken at', async () => {
    const { staleRows } = await import('./subpath-weight.js');
    expect(staleRows(stampedPage('2026-10-12', '56,002'), stampedPage('2026-10-19', '56,002').replace('abc1234', 'def5678'))).toEqual([]);
  });

  it('names a row whose bytes moved, with both readings', async () => {
    const { staleRows } = await import('./subpath-weight.js');
    expect(staleRows(stampedPage('2026-10-19', '55,997'), stampedPage('2026-10-19', '56,002'))).toEqual([
      'page: | `burgee/commander/v14` | 14 | x | y | 55,997 |\n  this build: | `burgee/commander/v14` | 14 | x | y | 56,002 |',
    ]);
  });

  it('names a row the page lacks, and one the build no longer produces', async () => {
    const { staleRows } = await import('./subpath-weight.js');
    expect(staleRows('a\n', 'a\nb\n')).toEqual(['page: \n  this build: b', 'page: (nothing)\n  this build: ']);
    expect(staleRows('a\nb\n', 'a\n')).toEqual(['page: b\n  this build: ', 'page: \n  this build: (nothing)']);
  });

  it('is run by a required job, after that job builds', () => {
    const workflow = readFileSync(join(REPO_ROOT, '.github/workflows/compat.yml'), 'utf8');
    const ratchet = workflow.slice(workflow.indexOf('  ratchet:'), workflow.indexOf('\n  affected:'));
    const build = ratchet.indexOf("npx turbo run build --filter='./packages/*'");
    const check = ratchet.indexOf('npm run weight:page -- --check');
    expect(build, 'the ratchet job builds the packages').toBeGreaterThan(-1);
    expect(check, 'the ratchet job runs `npm run weight:page -- --check`').toBeGreaterThan(build);
  });
});
