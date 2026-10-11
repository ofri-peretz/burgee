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
 * The `--check` half is `subpath-weight.ts`'s own, run by CI: it regenerates into memory and
 * exits non-zero when the committed page differs, which is what makes *do not edit by hand*
 * true rather than aspirational. This file checks the cheaper, more important property — that
 * nothing is *missing* — because a stale number is visible and an absent row is not.
 */
import { readdirSync, readFileSync } from 'node:fs';
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
   * Staleness, not freshness, and the difference is the whole design.
   *
   * This page is generated from `dist/`, so a `--check` gate on it would go red on every pull
   * request that changes a byte anywhere — a gate nobody can keep green is a gate nobody reads,
   * which is what `quality.yml`'s own note about `compat:page --check` merging red in 29 seconds
   * is a record of. So the page carries the date it was taken and this asks only that somebody
   * has re-run `npm run weight:page` inside the window. The same shape, and the same number, as
   * `claim-table-lock.test.ts` uses on the results document for the same reason.
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
