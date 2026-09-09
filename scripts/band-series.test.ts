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

import { type BandConfig, collectBenchmark, DATED_JSON } from './control-bands';

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
