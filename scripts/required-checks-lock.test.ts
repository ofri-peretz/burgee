/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — every check `main` requires reports wherever a merge is decided: on a pull request, in
 * a merge-queue entry, and on a Version PR opened with GITHUB_TOKEN.
 *
 * A required check that never reports fails nothing. The pull request, the queue entry or the
 * Version PR sits at BLOCKED with nothing red. On 2026-11-01 the owner made nine checks required,
 * and the repository's own copy of the list (`REQUIRED_CHECKS`, which `lint-workflows.ts` rule 8
 * enforces) still held the old four, `review` among them. Five of the nine — the macOS and
 * Windows Node 24 cells, `CodeQL`, `Changeset present` and the completions check — had no
 * `merge_group:` trigger, and none had a row in the Version PR fallback, so the next Version PR
 * opened with GITHUB_TOKEN would have waited on them forever.
 *
 * What is held, each evaluated from the workflow's `on:` and the job's own `if:` (matrix names
 * expanded, `CodeQL` from the analyze step's upload), not matched as text:
 *  - `REQUIRED_CHECKS` is branch protection's list, exactly;
 *  - each name is produced by a job that runs on `pull_request`, and on `merge_group`;
 *  - each name has a row in the Version PR fallback (`changesets-pr.yml` → `checks`), and that
 *    row's workflow, dispatched with the row's inputs, produces it — except the ones
 *    `FALLBACK_CANNOT_PRODUCE` names, with the reason, and that list is `CodeQL` alone.
 */
import { describe, expect, it } from 'vitest';

import {
  dispatchOf,
  type Event,
  FALLBACK_CANNOT_PRODUCE,
  kickerRows,
  producedOn,
  readWorkflow,
  REQUIRED_CHECKS,
  runs,
  triggers,
  VERSION_PR_KICKER,
  type Workflow,
} from './required-checks.mjs';

/**
 * Branch protection's required contexts on 2026-11-01, as the API returned them (strict off):
 *
 *   gh api repos/ofri-peretz/burgee/branches/main/protection/required_status_checks --jq '.contexts[]'
 *
 * Six are pinned to GitHub Actions (app 15368), `CodeQL` to code scanning (57789), and the two
 * Quality gates to no app. When the owner changes branch protection, this list and
 * `REQUIRED_CHECKS` change together, in the same PR.
 */
const BRANCH_PROTECTION = [
  'Quality Gate',
  'Quality (Full) Gate',
  "Ratchet · each host's suite against burgee",
  'Node 24 · ubuntu-latest',
  'Node 24 · macos-latest',
  'Node 24 · windows-latest',
  'CodeQL',
  'Changeset present',
  'bash, zsh, fish, pwsh complete the demo',
];

const PULL_REQUESTS: Event[] = [
  { event_name: 'pull_request', labels: [] },
  { event_name: 'pull_request', labels: ['skip-changeset'] },
];
const QUEUE: Event = { event_name: 'merge_group' };

describe('REQUIRED_CHECKS is branch protection’s list', () => {
  it('names exactly the nine contexts main requires, and nothing it does not (no `review`)', () => {
    expect([...REQUIRED_CHECKS].toSorted()).toEqual([...BRANCH_PROTECTION].toSorted());
  });
});

describe('every required check reports on a pull request', () => {
  for (const ev of PULL_REQUESTS) {
    const produced = producedOn(ev);
    it.each([...REQUIRED_CHECKS])(`%s (labels ${JSON.stringify(ev.labels)})`, (check) => {
      expect(produced.get(check), `no job that runs on a pull request reports \`${check}\``).toBeDefined();
    });
  }
});

describe('every required check reports in a merge-queue entry', () => {
  const produced = producedOn(QUEUE);
  it.each([...REQUIRED_CHECKS])('%s', (check) => {
    expect(produced.get(check), `no job that runs on merge_group reports \`${check}\` — the queue entry would never merge and never fail`).toBeDefined();
  });

  it('is not blind: a workflow without the trigger produces nothing in the queue', () => {
    const wf = readWorkflow('completions.yml');
    const without: Workflow = { ...wf, on: Object.fromEntries(Object.entries(wf.on).filter(([k]) => k !== 'merge_group')) };
    expect(runs(without, 'shells', QUEUE)).toBe(false);
    expect(runs(wf, 'shells', QUEUE)).toBe(true);
  });
});

describe('every required check reports on a Version PR opened with GITHUB_TOKEN', () => {
  const kicker = readWorkflow(VERSION_PR_KICKER.file);
  const rows = kickerRows(kicker);

  it('can produce all but CodeQL, and says why it cannot produce CodeQL', () => {
    expect(Object.keys(FALLBACK_CANNOT_PRODUCE)).toEqual(['CodeQL']);
    expect(FALLBACK_CANNOT_PRODUCE['CodeQL']).toMatch(/pull_request analysis/u);
  });

  it.each(REQUIRED_CHECKS.filter((c) => !(c in FALLBACK_CANNOT_PRODUCE)))('%s has a row', (check) => {
    expect(rows.filter((r) => r.checks.includes(check)), `${VERSION_PR_KICKER.file} → ${VERSION_PR_KICKER.job} has no row mirroring \`${check}\``).toHaveLength(1);
  });

  it('dispatches each workflow once, and mirrors only required checks', () => {
    expect(new Set(rows.map((r) => r.workflow)).size).toBe(rows.length);
    for (const r of rows) for (const c of r.checks) expect(REQUIRED_CHECKS, `${r.workflow} mirrors \`${c}\`, which main does not require`).toContain(c);
  });

  for (const row of rows) {
    it(`${row.workflow}, dispatched${row.inputs ? ` with ${row.inputs}` : ''}, reports every check its row mirrors`, () => {
      const wf = readWorkflow(row.workflow);
      expect(triggers(wf)).toContain('workflow_dispatch');
      const declared = Object.keys(((wf.on['workflow_dispatch'] ?? {}) as { inputs?: object }).inputs ?? {});
      for (const k of Object.keys(dispatchOf(row).inputs ?? {})) expect(declared, `${row.workflow} declares no \`${k}\` input`).toContain(k);
      const produced = producedOn(dispatchOf(row), [row.workflow]);
      for (const c of row.checks) expect(produced.get(c), `${row.workflow} dispatched does not report \`${c}\``).toBeDefined();
    });
  }

  it('dispatching changesets-pr.yml for its check opens no Version PR — the fallback does not recurse', () => {
    const wf = readWorkflow('changesets-pr.yml');
    const row = rows.find((r) => r.workflow === 'changesets-pr.yml')!;
    expect(runs(wf, 'version', dispatchOf(row))).toBe(false);
    expect(runs(wf, 'version', { event_name: 'workflow_dispatch', inputs: {} })).toBe(true);
    expect(runs(wf, 'version', { event_name: 'push' })).toBe(true);
    expect(runs(wf, 'required', { event_name: 'workflow_dispatch', inputs: {} }), 'a bare dispatch would grade the branch it ran on').toBe(false);
  });

  it('mirrors every check of its row, by the row’s list, from one dispatched run', () => {
    const job = kicker.jobs[VERSION_PR_KICKER.job]!;
    expect(job.name).toContain('${{ matrix.workflow }}');
    const run = (job.steps ?? []).map((s) => s.run ?? '').join('\n');
    expect(JSON.stringify(job.steps)).toContain("join(matrix.checks, '|')");
    expect(run).toMatch(/for c in "\$\{checks\[@\]\}"/u);
    expect(run.match(/gh workflow run /gu)).toHaveLength(1);
  });
});
