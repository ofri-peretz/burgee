/**
 * Lock — the hand-maintained comparison page agrees with the measurements.
 *
 * `apps/docs/content/docs/comparison.mdx` is the repository's most prominent public
 * table, and it was not among the fifteen claims this suite settles. It disagreed with
 * the measurements on four rows: an installed size 5.4x under, an import cost that
 * flattered us by 12 ms, "lands level with cac" against a measured 1.39x, and a
 * compatibility count of 1,361 that has been 1,360 since the oracle's baseline was set.
 *
 * It cannot be generated the way `/docs/benchmarks` is — half its columns are oclif and
 * citty, which this suite does not measure, and the whole point of the page is to put six
 * frameworks in one table. So the numbers it *shares* with the suite are pinned here
 * instead. Re-measure and this goes red naming the page, which is the only thing that
 * makes "corrected by hand" different from "correct once, drift forever".
 *
 * Deliberately read from the **committed results file**, not from a live run: this is a
 * check on a document, not a benchmark, and it must give the same answer on every machine.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { type BenchRecord } from './record.js';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const RESULTS_DIR = join(REPO_ROOT, 'benchmarks', 'results', 'cli-benchmarks');
const PAGE = join(REPO_ROOT, 'apps', 'docs', 'content', 'docs', 'comparison.mdx');

const page = readFileSync(PAGE, 'utf8');
const latest = readdirSync(RESULTS_DIR)
  .filter((f) => f.endsWith('.json'))
  .toSorted()
  .at(-1) as string;
const records = (JSON.parse(readFileSync(join(RESULTS_DIR, latest), 'utf8')) as { records: BenchRecord[] }).records;

const value = (variant: string, metric: string): number => {
  const found = records.find((r) => r.variant === variant && r.metric === metric);
  if (found === undefined) throw new Error(`${latest} has no ${variant} ${metric} record`);
  return found.median;
};

const KB = 1024;
const MS_PLACES = 1;
const RATIO_PLACES = 2;
const kb = (variant: string): number => Math.round(value(variant, 'installed-bytes') / KB);

/**
 * One cell of the comparison table, found by its row label and its column header.
 *
 * Not `page.toContain`, which is what this file did first and which cannot see the table
 * at all: burgee's installed size is also stated in the prose three lines below it, so
 * reverting the *cell* to the 104 KB this page exists to correct left every assertion
 * green. A row's number has to be checked in the row.
 */
const cells = (line: string): string[] => line.split('|').slice(1, -1).map((c) => c.trim());
const rows = page.split('\n').filter((l) => l.startsWith('|'));
const header = cells(rows[0] as string).map((c) => c.replaceAll('*', ''));

const cell = (label: string, variant: string): string => {
  const column = header.indexOf(variant);
  if (column === -1) throw new Error(`comparison.mdx's table has no ${variant} column`);
  const row = rows.find((r) => cells(r)[0]?.startsWith(label));
  if (row === undefined) throw new Error(`comparison.mdx has no "${label}" row`);
  return cells(row)[column] ?? '';
};
/** The row the page publishes: a variant's median spawn less the bare-node floor. */
const overFloor = (variant: string): string => (value(variant, 'cold-start-ms') - value('bare node', 'cold-start-ms')).toFixed(MS_PLACES);

describe('comparison.mdx states the numbers the suite measured', () => {
  it.each([
    ['burgee', 'burgee'],
    ['commander', 'commander'],
    ['yargs', 'yargs'],
    ['cac', 'cac'],
  ])('installed size for %s', (_label, variant) => {
    expect(cell('Installed size', variant), `the ${variant} cell of the installed-size row`).toContain(`${String(kb(variant))} KB`);
  });

  it.each(['burgee', 'commander', 'yargs', 'cac'])('full-run delta over bare node for %s', (variant) => {
    expect(cell('Full CLI run', variant), `the ${variant} cell of the full-run row`).toContain(`+${overFloor(variant)} ms`);
  });

  it('states the cold start against cac as the ratio, not as "level with cac"', () => {
    const ratio = value('burgee ÷ cac', 'cold-start-ratio').toFixed(RATIO_PLACES);
    expect(page).toContain(`${ratio}x`);
    // The sentence that was there before the ratio was measured. It is not a matter of
    // wording: the measured claim is recorded as not met, and this said the opposite.
    expect(page).not.toContain('lands level');
  });

  it("states commander's compatibility count as the oracle holds it", () => {
    // It read 1,361 in the capabilities table and 1,215 in the prose below it. Both are
    // named on the page now, in the sentence that corrects them, so the check is that the
    // count it *states as ours* is the one the oracle holds — in both places.
    const passing = value('commander', 'passing-tests').toLocaleString('en-US');
    expect(page).toContain(`${passing} / ${passing} of commander's own tests`);
    expect(page).toContain(`graded by commander's own ${passing} tests`);
  });
});
