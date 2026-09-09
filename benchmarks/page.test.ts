/**
 * Lock — `/docs/benchmarks` states no figure for an axis that did not run.
 *
 * Shipped, and on the public page: the `reliability` axis landed after the measurement the
 * page is generated from was taken, so every cell fell through `?? 0` and the table read
 * `0.0%` exit-code accuracy for all three engines — directly above a paragraph asserting
 * that burgee answers correctly and the incumbents do not. Nothing looked broken, because
 * **zero is a plausible value for every column**: the good answer for `hangs-per-100` and a
 * devastating one for the other two.
 *
 * `bench:page --check` could not see it. It asks whether the page is what the generator
 * produces, and it was — the generator was faithfully rendering absent data. So the check
 * has to be on the rule instead: a section is drawn when its axis ran, and not when it did
 * not. The document already carries the answer in `axes.<name>.status`, which is what B1's
 * callout has read since this page was written.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { publishedResults } from './published.js';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const RESULTS_DIR = join(REPO_ROOT, 'benchmarks', 'results', 'cli-benchmarks');
const PAGE = join(REPO_ROOT, 'apps', 'docs', 'content', 'docs', 'benchmarks.mdx');

const page = readFileSync(PAGE, 'utf8');
const doc = JSON.parse(readFileSync(join(RESULTS_DIR, publishedResults(RESULTS_DIR) as string), 'utf8')) as {
  axes: Record<string, { status: string }>;
};

/** The heading that only ever appears inside a rendered table for that axis. */
const TABLE_MARKER = { reliability: 'hangs/100' } as const;

describe('the generated page draws a table only for an axis that ran', () => {
  it('reliability', () => {
    const ran = doc.axes['reliability']?.status === 'measured';
    expect(page.includes(TABLE_MARKER.reliability), ran ? 'the axis ran and its table is missing' : 'the axis did not run and the page states figures for it anyway').toBe(ran);
  });

  it('every axis the document reports as not measured is named as such on the page', () => {
    const unmeasured = Object.entries(doc.axes)
      .filter(([, a]) => a.status !== 'measured')
      .map(([name]) => name);
    for (const name of unmeasured) {
      expect(page, `${name} did not run, so the page must say so rather than print its defaults`).toMatch(/has not run|not been measured|unmeasured/);
    }
  });
});
