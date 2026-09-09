/**
 * Lock — a CI observation cannot become a published number.
 *
 * Proven necessary before it was written. On 2026-09-09 the recorder ran on a two-core
 * runner and opened a PR replacing `2026-09-09.json` wholesale. Merging it would have
 * demanded `+8.0 ms` of `comparison.mdx` where the page states `+22.6 ms`, turned
 * `docs.test.ts` red on five assertions, and — had the page been updated to match — moved
 * the project's public speed figures to whichever box picked up the job. Nothing got
 * faster; the runner was different, which is exactly what `perf.ts` warns its own readers
 * about.
 *
 * Both halves are checked, because the fix has two halves: the name says which kind of
 * file this is, and every reader that publishes a number honours it.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { observations, publishedResults } from './published.js';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const RESULTS_DIR = join(REPO_ROOT, 'benchmarks', 'results', 'cli-benchmarks');
const ISO_DATE = 10;

const scratch = (files: string[]): string => {
  const dir = mkdtempSync(join(tmpdir(), 'published-'));
  for (const f of files) writeFileSync(join(dir, f), '{}');
  return dir;
};

describe('publishedResults', () => {
  it('skips an observation taken after the last published measurement', () => {
    // The date is deliberately later, and the first version of this test got it wrong. An
    // observation from the *same* day sorts before its measurement by an accident of ASCII
    // — `-` is 0x2D and `.` is 0x2E — so a same-day fixture passes under the old
    // "whichever landed last" rule too, and proves nothing. The case that actually happens
    // is the next morning's run: `2026-09-10-abc1234.json` sorts after `2026-09-09.json`,
    // and "newest file" hands the docs a CI runner's numbers.
    const dir = scratch(['2026-09-09.json', '2026-09-10-abc1234.json']);
    try {
      expect(publishedResults(dir)).toBe('2026-09-09.json');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('still hands every file to the bands, which want the whole series', () => {
    const dir = scratch(['2026-09-09.json', '2026-09-09-4c97680.json']);
    try {
      expect(observations(dir).toSorted()).toEqual(['2026-09-09-4c97680.json', '2026-09-09.json']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('picks the newest measurement when several have been published', () => {
    const dir = scratch(['2026-09-08.json', '2026-09-10.json', '2026-09-09.json']);
    try {
      expect(publishedResults(dir)).toBe('2026-09-10.json');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('has nothing to publish from a suite that has never run here', () => {
    expect(publishedResults(join(REPO_ROOT, 'benchmarks', 'results', 'no-such-suite'))).toBeUndefined();
  });
});

describe('the generated page', () => {
  /**
   * End to end, against the real results directory and the real generator: an observation
   * landing beside the measurement must not change a single byte of `/docs/benchmarks`.
   * This is the assertion the workflow's `bench:page --check` step makes on every run, and
   * the one that goes red if a future reader reaches for "the newest file" again.
   */
  it('ignores an observation landing beside the published measurement', () => {
    const published = publishedResults(RESULTS_DIR) as string;
    // Tomorrow's date, so the observation sorts *after* the measurement — see the ASCII
    // note above; a same-day name would leave this green under the rule it exists to refuse.
    const day = new Date(`${published.replace('.json', '')}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() + 1);
    const observation = join(RESULTS_DIR, `${day.toISOString().slice(0, ISO_DATE)}-ffffff0.json`);
    // Divergent on purpose, and on the axis that actually diverges: a copy would pass under
    // the old "newest file" rule too, and would prove nothing. Every duration is doubled,
    // the way a slower runner reads.
    const doc = JSON.parse(readFileSync(join(RESULTS_DIR, published), 'utf8')) as { records: { unit: string; median: number; p95: number }[] };
    for (const r of doc.records) {
      if (r.unit !== 'ms') continue;
      r.median *= 2;
      r.p95 *= 2;
    }
    writeFileSync(observation, JSON.stringify(doc, null, 2));
    try {
      // Exits non-zero when the committed page is not what the results generate.
      execFileSync('npm', ['run', 'bench:page', '--', '--check'], { cwd: REPO_ROOT, stdio: 'pipe' });
    } finally {
      rmSync(observation, { force: true });
    }
  });
});
