/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock: `quality-full.yml` decides whether its heavy jobs run on each job, not in a job
 * they wait for — and decides it exactly the way the old `Gate` job did.
 *
 * The decision used to live in a three-second `gate` job that every heavy job `needs:`.
 * A job with `needs` is not queued until what it needs has finished, so on a saturated
 * account that one hop was a whole runner-queue wait on the path to the required
 * `Quality (Full) Gate` context before test, build or typecheck even entered the queue:
 * 112 s median, 584 s p90 over 20 PR runs. The same condition written on each job lets
 * them queue at push time.
 *
 * Two ways that goes wrong, both locked here:
 *  - a heavy job grows a `needs:` again and the hop is back;
 *  - the four copies of the condition drift, or stop meaning what the gate meant. The
 *    gate's rule is restated below as the function it computed, and each job's `if:` is
 *    evaluated against it over every combination of event, draft and label.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { load as loadYaml } from 'js-yaml';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW = join(REPO_ROOT, '.github/workflows/quality-full.yml');

type Job = { name?: string; needs?: string | string[]; if?: string };
const jobs = (loadYaml(readFileSync(WORKFLOW, 'utf8')) as { jobs: Record<string, Job> }).jobs;

const HEAVY = ['test', 'build', 'typecheck'] as const;
const AGGREGATE = 'quality-full-gate';

interface Event {
  event_name: string;
  event: { pull_request?: { draft: boolean; labels: { name: string }[] } };
}

/** What the removed `Gate` job's shell computed: `[[ $EVENT_NAME != pull_request ]] || [[ $IS_DRAFT == false ]] || [[ $HAS_LABEL == true ]]`. */
function gateDecided(github: Event): boolean {
  const pr = github.event.pull_request;
  return github.event_name !== 'pull_request' || pr?.draft === false || (pr?.labels ?? []).some((l) => l.name === 'run-full-ci');
}

/**
 * The atoms a job's `if:` may be built from, each with its meaning. The condition is read
 * as a disjunction of these — an `always() && (…)` wrapper aside — so an atom not in this
 * table fails the lock instead of being quietly misread, and nothing is `eval`ed.
 */
const ATOMS: Record<string, (github: Event) => boolean> = {
  "github.event_name != 'pull_request'": (g) => g.event_name !== 'pull_request',
  'github.event.pull_request.draft == false': (g) => g.event.pull_request?.draft === false,
  "contains(github.event.pull_request.labels.*.name, 'run-full-ci')": (g) =>
    (g.event.pull_request?.labels ?? []).some((l) => l.name === 'run-full-ci'),
};

/** Evaluate a job's `if:` for one event. */
function evaluate(expr: string, github: Event): boolean {
  const body = /^always\(\) && \((.*)\)$/s.exec(expr.trim())?.[1] ?? expr.trim();
  return body.split(' || ').some((atom) => {
    const meaning = ATOMS[atom.trim()];
    if (!meaning) throw new Error(`\`${atom}\` in \`${expr}\` is not an atom this lock knows the meaning of`);
    return meaning(github);
  });
}

const EVENTS: Event[] = [];
for (const event_name of ['pull_request', 'push', 'merge_group', 'workflow_dispatch', 'schedule']) {
  if (event_name !== 'pull_request') {
    EVENTS.push({ event_name, event: {} });
    continue;
  }
  for (const draft of [false, true]) {
    for (const labels of [[], [{ name: 'run-full-ci' }], [{ name: 'skip-changeset' }], [{ name: 'skip-changeset' }, { name: 'run-full-ci' }]]) {
      EVENTS.push({ event_name, event: { pull_request: { draft, labels } } });
    }
  }
}

describe('quality-full.yml runs its heavy jobs without a gate job to wait for', () => {
  it('has no job named Gate, and no heavy job needs anything', () => {
    expect(Object.values(jobs).map((j) => j.name)).not.toContain('Gate');
    for (const key of HEAVY) {
      expect(jobs[key], `${key} is gone`).toBeDefined();
      expect(jobs[key]!.needs, `${key} waits on another job again`).toBeUndefined();
    }
  });

  it('the aggregate reads every heavy job', () => {
    expect(jobs[AGGREGATE]?.needs).toEqual([...HEAVY]);
    expect(jobs[AGGREGATE]?.if).toMatch(/^always\(\) && \(/);
  });

  for (const key of [...HEAVY, AGGREGATE]) {
    it(`${key} runs exactly when the old gate said run`, () => {
      const cond = jobs[key]?.if;
      expect(cond, `${key} has no if:`).toBeTypeOf('string');
      for (const e of EVENTS) {
        expect(evaluate(cond!, e), `${key} on ${JSON.stringify(e)}`).toBe(gateDecided(e));
      }
    });
  }

  it('reaches both answers, so the equivalence above is not vacuous', () => {
    expect(new Set(EVENTS.map(gateDecided))).toEqual(new Set([true, false]));
  });
});
