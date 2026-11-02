/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — one run per pull request event that matters, so no cancelled twin of a required check
 * blocks a merge.
 *
 * `gh pr create --label skip-changeset` raises `opened` and one `labeled` per label in the same
 * second. Every workflow that listed `labeled` started once per event: #1429 had five runs of each
 * at 00:53:47Z and thirteen of them cancelled. A run cancelled after its jobs were created leaves
 * those checks `cancelled`, and its `always()` gate runs anyway and fails ("Quality (Full) Gate
 * failure"). Branch protection reads a required context from the most recently CREATED check
 * suite that carries it, whichever run the concurrency group let live. Of the last 80 merged PRs,
 * 37 carried such a twin: 35 merged past it because it sat in the older suite, and on #1418 the
 * cancelled `Ratchet · each host's suite against burgee` sat in the newer suite (112031688339
 * against the successful 112031687932, though it started and finished first) and the PR stayed
 * BLOCKED, all green, until the cancelled run was re-run (#1349 the same). Concurrency decides which twin survives; creation order decides which one counts; the
 * two disagree, so no concurrency key fixes it. The twin must not exist.
 *
 * What is held:
 *  - no workflow that reports a required check subscribes to `labeled`/`unlabeled`: a label event
 *    there is a second check suite on the same head commit, which is the bug;
 *  - no pull request workflow subscribes to `labeled`/`unlabeled` without reading a label;
 *  - a workflow that does subscribe runs no job for a label it does not read, and puts that run in
 *    a concurrency group of its own, so it cannot cancel the run of the change;
 *  - every label a required-check workflow reads is still acted on when it changes after the PR is
 *    opened: `pr-labels.yml` re-runs the PR's own run of each workflow that reads it, a new attempt
 *    in the same suite. Not a dispatch: a `workflow_dispatch` suite on the head commit is not among
 *    the PR's checks (#1433's rollup listed none), so it could neither pass nor fail one. A re-run
 *    keeps its event, so each step that reads the label from the event also reads it back live;
 *  - every required-check workflow's concurrency group, on a pull request, keys on the PR number:
 *    a newer push supersedes the older run, and two PRs never share a group.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  type Event,
  interpolate,
  producedOn,
  readWorkflow as read,
  REQUIRED_CHECKS,
  runs,
  triggers,
  type Workflow,
  WORKFLOWS_DIR,
  workflowFiles,
} from './required-checks.mjs';

const ROUTER = 'pr-labels.yml';
const LABEL_EVENTS = ['labeled', 'unlabeled'];
/** GitHub's default `types` for `pull_request` and `pull_request_target`. */
const DEFAULT_TYPES = ['opened', 'synchronize', 'reopened'];
const PR_EVENTS = ['pull_request', 'pull_request_target'];

const text = (file: string): string => readFileSync(join(WORKFLOWS_DIR, file), 'utf8');
/** The router, or an empty workflow when it is missing, so its absence fails cases rather than the file. */
const router = (): Workflow => (existsSync(join(WORKFLOWS_DIR, ROUTER)) ? read(ROUTER) : { on: {}, jobs: {} });

/** The activity types a workflow's pull request trigger subscribes to. */
function prTypes(wf: Workflow): string[] {
  const on = wf.on as Record<string, unknown> | undefined;
  return PR_EVENTS.flatMap((e) => {
    if (!on || !(e in on)) return [];
    const types = (on[e] as { types?: string[] } | null)?.types;
    return types ?? DEFAULT_TYPES;
  });
}

/** Whether a workflow reads a pull request's labels at all: from the event, or from the API. */
const readsLabels = (source: string): boolean => /labels\.\*\.name|event\.label\.name|--json [\w,]*\blabels\b/u.test(source);

/** The labels a workflow's checks depend on: `contains(…labels.*.name, 'x')` and the changeset check's `,x,` match. */
function labelsRead(source: string): string[] {
  const found = [...source.matchAll(/contains\(github\.event\.pull_request\.labels\.\*\.name, '([^']+)'\)/gu), ...source.matchAll(/grep -q ',([\w:-]+),'/gu)].map((m) => m[1]!);
  return [...new Set(found)].sort();
}

/** The labels a `labeled` run is filtered to: `github.event.label.name == 'x'`. */
function labelsFiltered(source: string): string[] {
  return [...new Set([...source.matchAll(/github\.event\.label\.name == '([^']+)'/gu)].map((m) => m[1]!))].sort();
}

const concurrencyGroup = (wf: Workflow): string => String(((wf as Workflow & { concurrency?: { group?: string } }).concurrency ?? {}).group ?? '');

const PR_FILES = workflowFiles().filter((f) => triggers(read(f)).some((t) => PR_EVENTS.includes(t)));

/** The workflows that report a required check on a pull request, labelled or not. */
const REQUIRED_FILES = [
  ...new Set(
    [{ event_name: 'pull_request', labels: [] }, { event_name: 'pull_request', labels: ['run-full-ci'] }, { event_name: 'pull_request', labels: ['skip-changeset'] }].flatMap((ev) => {
      const produced = producedOn(ev as Event);
      return REQUIRED_CHECKS.map((c) => produced.get(c)?.split(' → ')[0]).filter((f): f is string => f !== undefined);
    }),
  ),
].sort();

const LABELLED_FILES = PR_FILES.filter((f) => prTypes(read(f)).some((t) => LABEL_EVENTS.includes(t)));

describe('the reader is not blind', () => {
  it('finds the required-check workflows', () => {
    expect(REQUIRED_FILES).toEqual(['changesets-pr.yml', 'codeql.yml', 'compat.yml', 'completions.yml', 'quality-full.yml', 'quality.yml']);
  });

  it('reads the default activity types, and an explicit list', () => {
    expect(prTypes({ on: { pull_request: null }, jobs: {} } as unknown as Workflow)).toEqual(DEFAULT_TYPES);
    expect(prTypes({ on: { pull_request: { types: ['opened', 'labeled'] } }, jobs: {} })).toEqual(['opened', 'labeled']);
    expect(prTypes({ on: { push: {} }, jobs: {} })).toEqual([]);
  });

  it('reads a label read from the event, from the API and from the changeset check', () => {
    expect(readsLabels("if: contains(github.event.pull_request.labels.*.name, 'x')")).toBe(true);
    expect(readsLabels('gh pr view 1 --json headRefName,labels,author')).toBe(true);
    expect(readsLabels('run: npm test')).toBe(false);
    expect(labelsRead("contains(github.event.pull_request.labels.*.name, 'run-full-ci') grep -q ',skip-changeset,'")).toEqual(['run-full-ci', 'skip-changeset']);
  });

  it("renders a pull request's concurrency group with its number in it", () => {
    expect(interpolate('quality-${{ github.ref }}-${{ github.event_name == \'push\' && github.sha || \'\' }}', { event_name: 'pull_request', number: 7 })).toBe('quality-refs/pull/7/merge-');
  });
});

describe('no required check gets a twin check suite from a label event', () => {
  it.each(REQUIRED_FILES)('%s does not subscribe to labeled or unlabeled', (file) => {
    const label = prTypes(read(file)).filter((t) => LABEL_EVENTS.includes(t));
    expect(label, `${file} reports a required check and starts a second run on every label event — the twin that blocked #1418`).toEqual([]);
  });

  it.each(PR_FILES)('%s subscribes to a label event only if it reads a label', (file) => {
    if (prTypes(read(file)).some((t) => LABEL_EVENTS.includes(t))) expect(readsLabels(text(file)), `${file} starts on labeled/unlabeled and never reads a label`).toBe(true);
  });
});

describe('a workflow that does subscribe to a label event acts only on its own label', () => {
  it('there is at least one, so this is not vacuous', () => {
    expect(LABELLED_FILES).toEqual(expect.arrayContaining([ROUTER, 'bench.yml']));
  });

  it.each(LABELLED_FILES)('%s names the labels it acts on', (file) => {
    expect(labelsFiltered(text(file)), `${file} subscribes to label events with no \`github.event.label.name == '…'\` filter`).not.toEqual([]);
  });

  it.each(LABELLED_FILES)('%s runs no job for a label it does not read', (file) => {
    const wf = read(file);
    const other: Event = { event_name: 'pull_request', action: 'labeled', label: 'documentation', labels: ['documentation'] };
    expect(Object.keys(wf.jobs).filter((job) => runs(wf, job, other))).toEqual([]);
  });

  it.each(LABELLED_FILES)('%s runs a job for each label it filters to', (file) => {
    const wf = read(file);
    for (const label of labelsFiltered(text(file))) {
      const ev: Event = { event_name: 'pull_request', action: 'labeled', label, labels: [label] };
      expect(Object.keys(wf.jobs).filter((job) => runs(wf, job, ev)), `${file} on labeled ${label}`).not.toEqual([]);
    }
  });

  it.each(LABELLED_FILES)("%s puts another label's run in a group of its own, so it cancels nothing", (file) => {
    const wf = read(file);
    const group = concurrencyGroup(wf);
    const opened = interpolate(group, { event_name: 'pull_request', number: 5, runId: 1 });
    const other = interpolate(group, { event_name: 'pull_request', number: 5, runId: 2, action: 'labeled', label: 'documentation', labels: ['documentation'] });
    expect(other, `${file}: a \`documentation\` label would cancel the run of the change`).not.toBe(opened);
  });
});

const routerScript = (): string => (router().jobs['rerun']?.steps ?? []).map((s) => s.run ?? '').join('\n');
/** The workflows the router's `case` arm for a label re-runs. */
const rerunFor = (label: string): string =>
  routerScript()
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith(`${label}) `))
    ?.slice(label.length + 2) ?? '';

describe('a label changed after the PR is opened still reaches the checks that read it', () => {
  const READ = REQUIRED_FILES.flatMap((file) => labelsRead(text(file)).map((label) => ({ file, label })));

  it('the required-check workflows read run-full-ci and skip-changeset', () => {
    expect([...new Set(READ.map((r) => r.label))].sort()).toEqual(['run-full-ci', 'skip-changeset']);
  });

  it.each(READ)('$label, added later, re-runs $file', ({ file, label }) => {
    const wf = router();
    expect(wf.jobs['rerun'] !== undefined && runs(wf, 'rerun', { event_name: 'pull_request', action: 'labeled', label, labels: [label] }), `${ROUTER} does not act on labeled ${label}`).toBe(true);
    expect(rerunFor(label).split(/\s+/u), `${ROUTER} does not re-run ${file} when ${label} changes`).toContain(file);
  });

  it('re-runs the pull request run, in its own suite; it never dispatches one', () => {
    const script = routerScript();
    expect(script).toMatch(/gh run list --workflow "\$wf" --commit "\$SHA" --event pull_request/u);
    expect(script).toMatch(/gh run rerun "\$id"/u);
    expect(script).not.toMatch(/gh workflow run/u);
  });

  it.each(READ)("$file reads $label back live in every step that reads it from the event", ({ file, label }) => {
    const wf = read(file);
    const steps = Object.values(wf.jobs).flatMap((job) => job.steps ?? []);
    const fromEvent = steps.filter((s) => Object.values((s as { env?: Record<string, unknown> }).env ?? {}).some((v) => /labels\.\*\.name/u.test(String(v))));
    expect(fromEvent.length, `${file} reads ${label} in no step`).toBeGreaterThan(0);
    for (const s of fromEvent) expect(s.run ?? '', `${file} → ${s.name ?? s.run?.slice(0, 40)}: reads the labels from the event only, which a re-run does not refresh`).toMatch(/gh pr view "\$PR_NUMBER"|meta "\$PR_NUMBER"/u);
  });

  it('removing skip-changeset re-runs the changeset check, so it can go red', () => {
    const wf = router();
    expect(wf.jobs['rerun'] !== undefined && runs(wf, 'rerun', { event_name: 'pull_request', action: 'unlabeled', label: 'skip-changeset', labels: [] })).toBe(true);
  });

  it('the changeset check reads the labels live on a pull request, not from the event', () => {
    const step = (read('changesets-pr.yml').jobs['required']?.steps ?? []).find((s) => s.name === 'Which change this is')?.run ?? '';
    expect(/pull_request\)[\s\S]*?meta "\$PR_NUMBER"/u.test(step), 'Changeset present reads the labels the event carried, which a label added with `gh pr create --label` may not be in yet').toBe(true);
  });
});

describe("a required-check workflow's concurrency group keys on the pull request", () => {
  it.each(REQUIRED_FILES)('%s', (file) => {
    const group = concurrencyGroup(read(file));
    const a1 = interpolate(group, { event_name: 'pull_request', number: 4242, runId: 1, action: 'opened' });
    const a2 = interpolate(group, { event_name: 'pull_request', number: 4242, runId: 2, action: 'synchronize' });
    const b = interpolate(group, { event_name: 'pull_request', number: 4243, runId: 3, action: 'opened' });
    expect(a1, `${file}: the group does not name the PR`).toContain('4242');
    expect(a2, `${file}: a newer push to the same PR is in another group and does not supersede`).toBe(a1);
    expect(b, `${file}: two PRs share a group and cancel each other`).not.toBe(a1);
  });
});
