/**
 * Lock — a band's series includes the observations, not just the published measurement.
 *
 * #105 split `benchmarks/results/<suite>/` into two shapes: `<date>.json`, the published
 * measurement a person chose, and `<date>-<sha>.json`, an observation from the CI run at
 * that commit. Its PR body said the bands would glob the directory and read both. They did
 * not — this pattern and the `git log` pathspec beside it both matched only the first
 * shape, so eleven landed observations fed nothing and every band sat at one point against
 * a `minPoints` of 8.
 *
 * That is the worst way for this to fail. A band with too few points reports exactly what a
 * healthy quiet band reports, so the watcher looked like it was working the whole time.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { type BandConfig, collectBenchmark, DATED_JSON, mergeObservations } from './control-bands';

describe('which files are a suite’s series', () => {
  it.each(['2026-09-09.json', '2026-09-09-5bc506c.json', '2026-09-10-abc1234.json'])('%s is one', (f) => {
    expect(DATED_JSON.test(f)).toBe(true);
  });

  it.each(['latest.json', 'results.json', '2026-09.json', '2026-09-09-nothex.json', '2026-09-09-5bc506c.txt'])('%s is not', (f) => {
    expect(DATED_JSON.test(f)).toBe(false);
  });
});

describe('collectBenchmark', () => {
  it('reads every observation beside the published measurement, and nothing else', () => {
    const root = mkdtempSync(join(tmpdir(), 'bands-'));
    const dir = join(root, 'benchmarks', 'results', 'cli-benchmarks');
    try {
      mkdirSync(dir, { recursive: true });
      const put = (name: string, value: number): void => void writeFileSync(join(dir, name), JSON.stringify({ bands: { r: { value } } }));
      put('2026-09-09.json', 1.1);
      put('2026-09-09-5bc506c.json', 1.2);
      put('2026-09-10-abc1234.json', 1.3);
      put('notes.json', 9.9);
      const cfg = { id: 'r', collector: 'benchmark-json', suite: 'cli-benchmarks', jsonPath: 'bands.r.value', worse: 'higher' } as unknown as BandConfig;
      // Sorted by filename, so the same-day observation precedes its measurement — see the
      // ASCII note in `benchmarks/published.ts`. What matters is that all three are here.
      expect(collectBenchmark(cfg, root).map((o) => o.value)).toEqual([1.2, 1.1, 1.3]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('mergeObservations', () => {
  /**
   * `--backfill-git` runs both collectors, and since the series learned to read
   * `<date>-<sha>.json` they both find every observation — so a run hands `record()` two
   * copies of each. The old set of known dates was built once, before the loop, so both
   * copies passed it: the first recorded run after that change appended sixteen duplicate
   * pairs and grew the series file by 1,454 lines in a day.
   */
  it('takes one of two identical copies from the same run', () => {
    const twice = [
      { date: '2026-09-09-aaaaaaa', value: 1.065 },
      { date: '2026-09-09-aaaaaaa', value: 1.065 },
      { date: '2026-09-09-bbbbbbb', value: 1.07 },
      { date: '2026-09-09-bbbbbbb', value: 1.07 },
    ];
    const got = mergeObservations([], twice);
    expect(got.series.map((o) => o.date)).toEqual(['2026-09-09-aaaaaaa', '2026-09-09-bbbbbbb']);
    expect(got.added).toBe(2);
    expect(got.conflicts).toEqual([]);
  });

  it('is still idempotent against what is already recorded', () => {
    const had = [{ date: '2026-09-09', value: 1.161 }];
    const got = mergeObservations(had, [{ date: '2026-09-09', value: 1.161 }, { date: '2026-09-10-ccccccc', value: 1.08 }]);
    expect(got.added).toBe(1);
    expect(got.series).toHaveLength(2);
  });

  it('reports a date arriving with two different values rather than picking one', () => {
    // Not a duplicate: the working tree and git history disagreeing about one commit's
    // results is a fact about the data, and silently keeping whichever arrived first is how
    // it would never be noticed.
    const got = mergeObservations([], [{ date: '2026-09-09-aaaaaaa', value: 1.06 }, { date: '2026-09-09-aaaaaaa', value: 1.31 }]);
    expect(got.conflicts).toEqual(['2026-09-09-aaaaaaa: 1.06 then 1.31']);
    expect(got.series).toHaveLength(1);
  });

  it('keeps the series in date order', () => {
    const got = mergeObservations([{ date: '2026-09-10', value: 2 }], [{ date: '2026-09-08', value: 1 }]);
    expect(got.series.map((o) => o.date)).toEqual(['2026-09-08', '2026-09-10']);
  });
});
