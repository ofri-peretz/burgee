/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — the sample counts the published medians rest on do not shrink (cli-benchmarks R6, B1).
 *
 * `cli-benchmarks/spec.md` R6 asks for at least 30 spawns per variant on the perf axis, and B1
 * for a median over at least five runs per task on the agent axis. Both were true by
 * configuration and held by nothing: `ROUNDS = 52` and five runs per task could each have been
 * lowered to make a slow CI job faster, and every test would have stayed green while the
 * medians on the page got noisier. The perf half also reads the newest committed CI reading,
 * because a record's `samples` is what a reader of the JSON sees. The agent half does not: a
 * run that reports no usage is left out of its medians by design, so a recorded count may
 * legitimately sit under the configured one.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { readTasks, RUNS_PER_TASK } from './axes/agent.js';
import { ROUNDS } from './axes/perf.js';
import { SCALE_ROUNDS } from './axes/scale.js';

/** The floors the two test names state; change both together. */
const PERF_MIN_SAMPLES = 30;
const AGENT_MIN_RUNS = 5;

const RESULTS = fileURLToPath(new URL('results/cli-benchmarks/', import.meta.url));

describe('sample floors', () => {
  it('perf spawns every variant at least 30 times per run (R6)', () => {
    expect(ROUNDS).toBeGreaterThanOrEqual(PERF_MIN_SAMPLES);
    // The Z5 scale rows ride the perf axis in rounds of their own; at 24 they put six records
    // under the floor in every CI reading, and only the newest committed reading noticed.
    expect(SCALE_ROUNDS).toBeGreaterThanOrEqual(PERF_MIN_SAMPLES);
  });

  it('the newest CI reading carries those samples on every perf record', () => {
    const newest = readdirSync(RESULTS).filter((f) => f.endsWith('-ci.json')).sort().at(-1);
    expect(newest, 'no CI reading is committed').toBeDefined();
    const doc = JSON.parse(readFileSync(join(RESULTS, newest!), 'utf8')) as { records: { axis: string; variant: string; samples: number }[] };
    const perf = doc.records.filter((r) => r.axis === 'perf');
    expect(perf.length).toBeGreaterThan(0);
    expect(perf.filter((r) => r.samples < PERF_MIN_SAMPLES).map((r) => `${r.variant}: ${String(r.samples)}`), newest).toEqual([]);
  });

  it('the agent axis runs every task at least 5 times per build (B1)', () => {
    expect(RUNS_PER_TASK).toBeGreaterThanOrEqual(AGENT_MIN_RUNS);
    expect(readTasks().length).toBeGreaterThan(0);
  });
});
