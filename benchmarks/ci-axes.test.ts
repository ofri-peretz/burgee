/**
 * Lock — every axis of the cheap suite actually runs in the cheap CI job.
 *
 * `reliability` landed as a fifth axis, with three bands and a gate, and was never added
 * to the one command that runs the cheap suite. So it ran **nowhere**: not on a PR, not on
 * a push, not in any of the eleven observations the recorder has landed. `/docs/benchmarks`
 * said the axis had not run — which was true, and would have stayed true — and its bands
 * had no series to read while looking, from the outside, exactly like bands that were
 * simply quiet.
 *
 * Nothing caught it because everything downstream was honest about it. The document said
 * `not-run`, the page said it had not run, the bands reported no points. The gap was that
 * no one had said it *should* run, which is what this file says.
 *
 * The pairing is the whole check: an axis is in the cheap suite (`suiteOf`) exactly when
 * the workflow passes it to `npm run bench`. Adding an axis to `AxisName` and forgetting
 * the workflow is now a failure, and so is the reverse.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { SUITE, suiteOf } from './bands.js';
import { type AxisName } from './record.js';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const WORKFLOW = readFileSync(join(REPO_ROOT, '.github', 'workflows', 'bench.yml'), 'utf8');

/** Every axis the type declares. Kept here rather than imported: `run.ts` runs on import. */
const ALL_AXES: AxisName[] = ['perf', 'compat', 'weight', 'reliability', 'agent'];

/** The `--axis <name>` arguments of a `npm run bench` line in the workflow. */
function axesOf(line: string): AxisName[] {
  const out: AxisName[] = [];
  const words = line.split(/\s+/);
  words.forEach((word, i) => {
    if (word !== '--axis') return;
    const next = words[i + 1];
    if (next !== undefined) out.push(next as AxisName);
  });
  return out;
}

const benchLines = WORKFLOW.split('\n').filter((l) => l.includes('npm run bench --') && l.includes('--axis'));
/** Two jobs select axes, on the two cadences the intent sets, and each owns a suite. */
const selections = benchLines.map((l) => axesOf(l));
const forSuite = (suite: string): AxisName[] => ALL_AXES.filter((a) => suiteOf(a) === suite).toSorted();

describe('each CI job runs its whole suite', () => {
  it('has one axis-selecting command per suite, so there is one thing to check for each', () => {
    expect(selections).toHaveLength(2);
  });

  it.each([SUITE.cheap, SUITE.agent])('%s', (suite) => {
    const wanted = forSuite(suite);
    const found = selections.find((axes) => axes.some((a) => suiteOf(a) === suite));
    expect(found?.toSorted(), `the job running ${suite} does not select exactly its axes`).toEqual(wanted);
  });

  it('names an axis the suite knows — a typo would silently select nothing', () => {
    for (const axis of selections.flat()) expect(ALL_AXES).toContain(axis);
  });

  it('never mixes the two suites in one command — they run on different cadences', () => {
    for (const axes of selections) expect(new Set(axes.map((a) => suiteOf(a))).size).toBe(1);
  });
});
