/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — heavy work does not run during CI/CD; it runs on a nightly schedule
 * (D-20261101-heavy-ci-runs-nightly). The owner, 2026-11-01: "ensure we're not running heavy
 * tasks during CI-CD, benchmarks, etc should be running through a scheduler over night".
 *
 * Before this, `bench.yml` measured on every pull request and every push to `main`, and each push
 * opened or extended a `chore/bench-series` PR whose merge was the next push: one observation PR
 * every 20–30 minutes, each starting more CI and superseding release runs. `compat.yml` ran its
 * 13-job OS × Node matrix (about 92 job-minutes) on every pull request and about 103 on every push.
 *
 * What is held:
 *  - every job in `HEAVY` reports nothing on a push or an unlabelled pull request — evaluated from
 *    the workflow's `on:` and the job's own `if:`, not matched as text;
 *  - every check `main`'s branch protection requires (`REQUIRED`, as the owner set it on
 *    2026-11-01) is still produced by a job that runs on a pull request, under its exact name —
 *    the compat matrix's three Node 24 cells among them. A required check that never reports
 *    blocks every merge, so moving one of these to the night is the failure this guards;
 *  - the heavy workflows run on a nightly cron between 03:00 and 05:00 UTC, at staggered times,
 *    and a nightly failure opens or updates an issue;
 *  - the gates stay where they were: `Quality Gate` and `Quality (Full) Gate` still report on a
 *    push to `main` (release.yml's verify waits for exactly those two), the compatibility ratchet
 *    still reports on every pull request and queue entry, and B4 weight still gates a pull request.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { checkNames, type Event, evaluate, producedOn, readWorkflow as read, REPO_ROOT, REQUIRED_CHECKS as REQUIRED, runs, type Workflow } from './required-checks.mjs';

/**
 * The heavy jobs: benchmarks, the off-Linux and floor-Node compat cells, the paid evals and the
 * full mutation run. `bench.yml`'s `agent` may still run on a pull request the owner labels
 * `bench:agent` — the label is the request to spend — and nowhere else outside the schedule.
 */
const HEAVY: { file: string; job: string }[] = [
  { file: 'bench.yml', job: 'cheap' },
  { file: 'bench.yml', job: 'floor' },
  { file: 'bench.yml', job: 'agent' },
  { file: 'compat.yml', job: 'controls' },
  { file: 'compat.yml', job: 'floor' },
  { file: 'evals.yml', job: 'evals' },
  { file: 'mutation.yml', job: 'full' },
];

/** What CI/CD is: a push to `main`, a pull request however it is labelled for review, a queue entry. */
const CI_EVENTS: Event[] = [
  { event_name: 'push' },
  { event_name: 'merge_group' },
  { event_name: 'pull_request', labels: [] },
  { event_name: 'pull_request', labels: ['skip-changeset'] },
  { event_name: 'pull_request', labels: ['documentation', 'skip-changeset'] },
];

describe('no heavy job runs during CI/CD (D-20261101-heavy-ci-runs-nightly)', () => {
  for (const { file, job } of HEAVY) {
    it(`${file} → ${job} does not start on a push, a pull request or a queue entry`, () => {
      const wf = read(file);
      expect(wf.jobs[job], `${file} has no \`${job}\` job — renaming a heavy job must move this list with it`).toBeDefined();
      for (const ev of CI_EVENTS) expect(runs(wf, job, ev), `${file} → ${job} on ${JSON.stringify(ev)}`).toBe(false);
    });
  }

  it('a pull request labelled run-full-ci can still ask for the whole compat matrix', () => {
    const wf = read('compat.yml');
    const ev: Event = { event_name: 'pull_request', labels: ['run-full-ci'] };
    expect(evaluate(String(wf.jobs['matrix']?.strategy?.matrix?.os), ev)).toEqual(['ubuntu-latest', 'macos-latest', 'windows-latest']);
    expect(runs(wf, 'floor', ev)).toBe(true);
    expect(runs(wf, 'controls', ev)).toBe(true);
  });

  it('bench.yml and compat.yml no longer subscribe to a push at all', () => {
    expect(Object.keys(read('bench.yml').on)).not.toContain('push');
    expect(Object.keys(read('compat.yml').on)).not.toContain('push');
    expect(Object.keys(read('evals.yml').on)).not.toContain('pull_request');
  });
});

/** The nightly crons: `minute hour * * *`. */
const nightly = (wf: Workflow): string[] => {
  const s = (wf.on['schedule'] ?? []) as { cron: string }[];
  return s.map((c) => c.cron).filter((c) => /^\d+ \d+ \* \* \*$/u.test(c));
};
const minuteOfDay = (cron: string): number => {
  const [m, h] = cron.split(' ').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

describe('the heavy work runs over night, and a failed night is loud', () => {
  const NIGHTLY = ['bench.yml', 'compat.yml'];

  it.each(NIGHTLY)('%s runs once a night between 03:00 and 05:00 UTC', (file) => {
    const crons = nightly(read(file));
    expect(crons, `${file} has no daily cron`).toHaveLength(1);
    expect(minuteOfDay(crons[0]!)).toBeGreaterThanOrEqual(3 * 60);
    expect(minuteOfDay(crons[0]!)).toBeLessThan(5 * 60);
  });

  it('the nightly runs are staggered, so they do not ask the shared runner pool at once', () => {
    const times = NIGHTLY.map((f) => minuteOfDay(nightly(read(f))[0]!));
    expect(new Set(times).size).toBe(times.length);
  });

  it.each(NIGHTLY)('%s opens or updates an issue when a nightly run fails', (file) => {
    const wf = read(file);
    const reporters = Object.values(wf.jobs).filter(
      (j) => j.permissions?.['issues'] === 'write' && /github\.event_name == 'schedule'/u.test(j.if ?? '') && /failure/u.test(j.if ?? ''),
    );
    expect(reporters, `${file} has no job that reports a failed nightly run`).toHaveLength(1);
    const body = (reporters[0]!.steps ?? []).map((s) => s.run ?? '').join('\n');
    expect(body).toContain('gh issue create');
    expect(body).toContain('gh issue comment');
  });

  it('bench.yml lands at most one observation a night: only the scheduled run lands', () => {
    const land = read('bench.yml').jobs['cheap']?.steps?.find((s) => /^Land the day's observations/u.test(s.name ?? ''));
    expect(land?.if).toBe("github.event_name == 'schedule'");
  });

  it('B1 stays weekly: the nightly cron does not start the paid agent job', () => {
    const wf = read('bench.yml');
    const [daily] = nightly(wf);
    const weekly = ((wf.on['schedule'] ?? []) as { cron: string }[]).map((c) => c.cron).find((c) => c !== daily);
    expect(runs(wf, 'agent', { event_name: 'schedule', schedule: daily })).toBe(false);
    expect(runs(wf, 'agent', { event_name: 'schedule', schedule: weekly })).toBe(true);
    expect(runs(wf, 'cheap', { event_name: 'schedule', schedule: daily })).toBe(true);
    expect(runs(wf, 'cheap', { event_name: 'schedule', schedule: weekly }), 'the weekly B1 cron would land a second observation that day').toBe(false);
  });
});

describe('the gates stay on CI/CD', () => {
  it('a push to main still produces both gates release.yml waits for', () => {
    const release = readFileSync(join(REPO_ROOT, '.github/workflows/release.yml'), 'utf8');
    const checks = /CHECKS: "([^"]+)"/u.exec(release)?.[1]?.split('|') ?? [];
    expect(checks).toEqual(['Quality Gate', 'Quality (Full) Gate']);
    const push: Event = { event_name: 'push' };
    for (const [file, name] of [['quality.yml', 'Quality Gate'], ['quality-full.yml', 'Quality (Full) Gate']] as const) {
      const wf = read(file);
      const key = Object.keys(wf.jobs).find((k) => wf.jobs[k]?.name === name);
      expect(key, `${file} reports no \`${name}\``).toBeDefined();
      expect((wf.on['push'] as { branches?: string[] } | undefined)?.branches).toEqual(['main']);
      expect(runs(wf, key!, push), `${name} on a push to main`).toBe(true);
      for (const need of [wf.jobs[key!]?.needs ?? []].flat()) expect(runs(wf, need, push), `${name} needs ${need}, which no longer runs on a push`).toBe(true);
    }
  });

  it("the compatibility ratchet, a required check, still reports on every pull request and queue entry", () => {
    const wf = read('compat.yml');
    expect(wf.jobs['ratchet']?.name).toBe("Ratchet · each host's suite against burgee");
    for (const ev of CI_EVENTS.filter((e) => e.event_name !== 'push')) expect(runs(wf, 'ratchet', ev), JSON.stringify(ev)).toBe(true);
  });

  it('B4 weight (and the byte-exact reliability and floor ratchets) gate every pull request', () => {
    const wf = read('bench.yml');
    const key = Object.keys(wf.jobs).find((k) => (wf.jobs[k]?.steps ?? []).some((s) => /npm run bench -- .*--axis weight .*--check/u.test(s.run ?? '')) && runs(wf, k, { event_name: 'pull_request', labels: [] }));
    expect(key, 'no job runs `--axis weight --check` on a pull request').toBeDefined();
    const commands = (wf.jobs[key!]?.steps ?? []).map((s) => s.run ?? '').join('\n');
    expect(commands).toMatch(/--axis reliability/u);
    expect(commands).toMatch(/--axis floor --check/u);
    // Runner-noisy axes measure milliseconds, which are a property of the box: those are nightly.
    expect(commands).not.toMatch(/--axis (?:perf|compat|runtime|agent)\b/u);
  });
});

describe("every check main's branch protection requires still reports on a pull request", () => {
  const PRS: Event[] = [
    { event_name: 'pull_request', labels: [] },
    { event_name: 'pull_request', labels: ['skip-changeset'] },
  ];

  for (const ev of PRS) {
    const produced = producedOn(ev);
    it.each(REQUIRED)(`%s (labels ${JSON.stringify(ev.labels)})`, (check) => {
      expect(produced.get(check), `no job that runs on a pull request reports \`${check}\` — a required check that never reports blocks every merge`).toBeDefined();
    });
  }

  it('reads the matrix: the compat cells are named per OS, and all three run on a pull request', () => {
    const produced = producedOn({ event_name: 'pull_request', labels: [] });
    for (const os of ['ubuntu-latest', 'macos-latest', 'windows-latest']) expect(produced.get(`Node 24 · ${os}`)).toBe('compat.yml → matrix');
  });

  it('is not blind: narrowing the compat matrix to Linux on a pull request drops two required checks', () => {
    const wf = read('compat.yml');
    const narrowed = "${{ fromJSON(github.event_name == 'pull_request' && '[\"ubuntu-latest\"]' || '[\"ubuntu-latest\",\"macos-latest\",\"windows-latest\"]') }}";
    const job = { ...wf.jobs['matrix']!, strategy: { matrix: { ...wf.jobs['matrix']!.strategy!.matrix, os: narrowed } } };
    const names = checkNames('matrix', job, { event_name: 'pull_request', labels: [] });
    expect(names).toEqual(['Node 24 · ubuntu-latest']);
  });
});
