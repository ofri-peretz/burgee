/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — the control-band watcher finishes inside its job's time limit.
 *
 * Run 40311991676 (2026-10-26) was cancelled at control-bands.yml's 20-minute limit inside
 * "Record observations and evaluate bands", before the step that lands the points, so no band
 * gained one that week (B-20261026-control-bands-demo-build-and-budget). Two things are held:
 *
 *   1. each suite's git history is read once, not once per band: the watcher walked the same
 *      `cli-benchmarks` history for each of its fifty bands at about 23 s a walk;
 *   2. the job's `timeout-minutes` covers the cap the watcher gives `npm test` plus the minutes
 *      it needs beyond it, both stated in `control-bands.ts`, so raising the cap without the
 *      limit fails here rather than in a scheduled run nobody watches.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { type BandConfig, collectFromGit, COMMAND_TIMEOUT_MS, type Git, suiteHistoryReader, WATCH_MINUTES_BEYOND_TEST } from './control-bands';

const ROOT = join(import.meta.dirname, '..');
const MINUTE_MS = 60000;

/** A band of `suite` reading `bands.<id>.value`, as `derivedCompatBands` writes one. */
const band = (id: string, suite = 'cli-benchmarks'): BandConfig => ({ id, description: id, collector: 'benchmark-json', suite, jsonPath: `bands.${id}.value`, window: 20, minPoints: 8, worse: 'lower' });

/** A repository whose history holds two CI documents for `cli-benchmarks`, counting each git call. */
function fakeGit(): { run: Git; calls: string[] } {
  const calls: string[] = [];
  const docs: Record<string, unknown> = {
    'benchmarks/results/cli-benchmarks/2026-10-01-aaaaaaa.json': { machine: { ci: true }, measured: '2026-10-01T05:00:00Z', bands: { a: { value: 1 }, b: { value: 10 } } },
    'benchmarks/results/cli-benchmarks/2026-10-02-bbbbbbb.json': { machine: { ci: true }, measured: '2026-10-02T05:00:00Z', bands: { a: { value: 2 }, b: { value: 20 } } },
  };
  const run: Git = (args) => {
    calls.push(args[0] ?? '');
    if (args[0] === 'log') return args.at(-1)?.includes('/cli-benchmarks/') === true ? `${Object.keys(docs).join('\n')}\n` : '';
    if (args[0] === 'rev-list') return 'newer\nolder\n';
    const rel = String(args[1]).replace(/^older:/u, '');
    return JSON.stringify(docs[rel]);
  };
  return { run, calls };
}

describe('the watcher reads each suite’s history once (B-20261026-control-bands-demo-build-and-budget)', () => {
  it('walks git once for a suite however many bands read it', () => {
    const { run, calls } = fakeGit();
    const history = suiteHistoryReader(run);
    expect(collectFromGit(band('a'), history).map((o) => o.value)).toEqual([1, 2]);
    expect(collectFromGit(band('b'), history).map((o) => o.value)).toEqual([10, 20]);
    expect(collectFromGit(band('c'), history)).toEqual([]);
    // One `git log`, then a `rev-list` and a `show` per file: three bands cost what one does.
    expect(calls).toEqual(['log', 'rev-list', 'show', 'rev-list', 'show']);
  });

  it('reads a second suite on its own, once', () => {
    const { run, calls } = fakeGit();
    const history = suiteHistoryReader(run);
    expect(collectFromGit(band('a', 'agent-cli-bench'), history)).toEqual([]);
    expect(collectFromGit(band('b', 'agent-cli-bench'), history)).toEqual([]);
    expect(calls).toEqual(['log']);
  });

  it('keeps the name, value and `measured` a band reads off each document', () => {
    const { run } = fakeGit();
    expect(collectFromGit(band('a'), suiteHistoryReader(run))).toEqual([
      { date: '2026-10-01-aaaaaaa', value: 1, measured: '2026-10-01T05:00:00Z' },
      { date: '2026-10-02-bbbbbbb', value: 2, measured: '2026-10-02T05:00:00Z' },
    ]);
  });
});

describe('control-bands.yml gives the watcher the time it needs', () => {
  const wf = readFileSync(join(ROOT, '.github/workflows/control-bands.yml'), 'utf8');

  it('sets a job limit of at least the `npm test` cap plus the rest of the run', () => {
    const limit = Number(/\n {4}timeout-minutes: (\d+)\n/u.exec(wf)?.[1]);
    expect(limit).toBeGreaterThanOrEqual(COMMAND_TIMEOUT_MS / MINUTE_MS + WATCH_MINUTES_BEYOND_TEST);
  });
});
