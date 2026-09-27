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

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type BandConfig, chronological, collectBenchmark, DATED_JSON, evaluate, mergeObservations, type Observation } from './control-bands';

describe('which files are a suite’s series', () => {
  it.each(['2026-09-09.json', '2026-09-09-5bc506c.json', '2026-09-10-abc1234.json', '2026-09-22-c0fa8a3-ci.json', '2026-09-22-c0fa8a3-local.json'])('%s is one', (f) => {
    expect(DATED_JSON.test(f)).toBe(true);
  });

  it.each(['latest.json', 'results.json', '2026-09.json', '2026-09-09-nothex.json', '2026-09-09-5bc506c.txt', '2026-09-09-5bc506c-5bc506c.json', '2026-09-09-ci.json'])('%s is not', (f) => {
    expect(DATED_JSON.test(f)).toBe(false);
  });
});

describe('collectBenchmark', () => {
  it('reads every observation beside the published measurement, and nothing else', () => {
    const root = mkdtempSync(join(tmpdir(), 'bands-'));
    const dir = join(root, 'benchmarks', 'results', 'cli-benchmarks');
    try {
      mkdirSync(dir, { recursive: true });
      const put = (name: string, value: number, ci = true): void => void writeFileSync(join(dir, name), JSON.stringify({ machine: { ci }, bands: { r: { value } } }));
      put('2026-09-09.json', 1.1);
      put('2026-09-09-5bc506c.json', 1.2);
      put('2026-09-10-abc1234-ci.json', 1.3);
      put('notes.json', 9.9);
      // D-142: the same commit on a laptop is a different machine, and not this series.
      put('2026-09-10-abc1234-local.json', 1.7, false);
      put('2026-09-11.json', 1.8, false);
      const cfg = { id: 'r', collector: 'benchmark-json', suite: 'cli-benchmarks', jsonPath: 'bands.r.value', worse: 'higher' } as unknown as BandConfig;
      // Sorted by filename, so the same-day observation precedes its measurement — see the
      // ASCII note in `benchmarks/published.ts`. What matters is that all three CI runs are here
      // and neither local one is — a published measurement included, when a laptop made it.
      expect(collectBenchmark(cfg, root).map((o) => o.value)).toEqual([1.2, 1.1, 1.3]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

/**
 * #636 — a day holds a dozen CI runs, named `<day>-<sha>-ci.json`, and the series was ordered by
 * that name: within a day, by commit hash. Rules 2–4 read the LAST 3, 5 and 8 points, so they
 * were evaluated over whichever hashes sorted last. Every results document carries its own
 * `measured` timestamp; that is the order, and the name only breaks a tie.
 */
describe('a series is in the order it was measured, not the order its hashes sort', () => {
  const cfg = { id: 'r', collector: 'benchmark-json', suite: 'cli-benchmarks', jsonPath: 'bands.r.value', window: 20, minPoints: 8, worse: 'higher' } as unknown as BandConfig;

  /**
   * Sixteen runs on one day alternating 100/101 in time — ordinary variation, no band breached.
   * The 101s were given the hashes that sort last, so by name the last eight are all 101.
   * Written once: on a machine that scans every new file, a fixture per test costs seconds.
   */
  const RUNS = 16;
  let root = '';
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'bands-'));
    const dir = join(root, 'benchmarks', 'results', 'cli-benchmarks');
    mkdirSync(dir, { recursive: true });
    for (let i = 0; i < RUNS; i++) {
      const high = i % 2 === 1;
      const sha = `${high ? 'f' : '0'}${String(i).padStart(6, '0')}`;
      const measured = `2026-09-24T${String(i).padStart(2, '0')}:00:00.000Z`;
      writeFileSync(join(dir, `2026-09-24-${sha}-ci.json`), JSON.stringify({ measured, machine: { ci: true }, bands: { r: { value: high ? 101 : 100 } } }));
    }
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('collectBenchmark returns the day in measured order', () => {
    const got = collectBenchmark(cfg, root);
    expect(got.map((o) => o.value)).toEqual(Array.from({ length: RUNS }, (_, i) => (i % 2 === 1 ? 101 : 100)));
    expect(got.every((o) => typeof o.measured === 'string')).toBe(true);
  });

  it('so an alternating day is inside its band — by hash order it was "8 consecutive above"', () => {
    const series = mergeObservations([], collectBenchmark(cfg, root)).series;
    expect(evaluate(cfg, series)).toBeNull();
    // The same points in name order are what #636 evaluated.
    const byName = [...series].sort((a, b) => a.date.localeCompare(b.date));
    expect(evaluate(cfg, byName)?.rule).toBeDefined();
  });

  it('a stored series recorded without timestamps learns them and is re-ordered', () => {
    // What the committed history holds today: hash order, no `measured`.
    const stored: Observation[] = [
      { date: '2026-09-24-0aaaaaa-ci', value: 2 },
      { date: '2026-09-24-faaaaaa-ci', value: 1 },
    ];
    const collected: Observation[] = [
      { date: '2026-09-24-faaaaaa-ci', value: 1, measured: '2026-09-24T01:00:00.000Z' },
      { date: '2026-09-24-0aaaaaa-ci', value: 2, measured: '2026-09-24T02:00:00.000Z' },
    ];
    const got = mergeObservations(stored, collected);
    expect(got.added).toBe(0);
    expect(got.series.map((o) => o.value)).toEqual([1, 2]);
    expect(got.series.map((o) => o.measured)).toEqual(['2026-09-24T01:00:00.000Z', '2026-09-24T02:00:00.000Z']);
  });

  it('breaks a tie on the name, and keeps an untimed point inside its own day', () => {
    const a: Observation = { date: '2026-09-24-aaaaaaa-ci', value: 0, measured: '2026-09-24T05:00:00.000Z' };
    const b: Observation = { date: '2026-09-24-bbbbbbb-ci', value: 0, measured: '2026-09-24T05:00:00.000Z' };
    const untimed: Observation = { date: '2026-09-24', value: 0 };
    const nextDay: Observation = { date: '2026-09-25-0000000-ci', value: 0, measured: '2026-09-25T00:00:00.000Z' };
    expect([nextDay, b, untimed, a].sort(chronological)).toEqual([untimed, a, b, nextDay]);
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
