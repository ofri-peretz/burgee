/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock: Dependabot auto-merge turns on only for patch and minor bumps that do not reach
 * a user.
 *
 * `dependabot-automerge.yml` hands a Dependabot PR to `gh pr merge --auto` when every
 * dependency it moves is a semver patch or minor and none is a direct production
 * dependency. GitHub Actions bumps are the exception to the second rule, because
 * Dependabot types every one of them `direct:production`. The rule is easy to widen by
 * accident. Reading fetch-metadata's headline outputs instead of every entry lets a grouped
 * PR through on its first dependency. A bare `any` for `all`, or a missing `length > 0`,
 * would merge a PR that nobody could read.
 *
 * This runs the step's own shell rather than matching its text, as changeset-check-lock
 * does, because what matters is what the script decides.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { scratchDirs } from './scratch-dir.js';
import { bashSpawns, runStepScenarios } from './step-scenarios.js';

/** Every scratch directory this file makes, removed after its last test (`scripts/scratch-dir.ts`). */
const scratchDir = scratchDirs();

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW = join(REPO_ROOT, '.github/workflows/dependabot-automerge.yml');

/** The `Does every update qualify?` step's `run:` body, dedented. Read as text, as lint-workflows.ts does. */
function decideScript(): string {
  const source = readFileSync(WORKFLOW, 'utf8');
  const at = source.indexOf('name: Does every update qualify?');
  expect(at, 'the `Does every update qualify?` step is gone, so this lock asserts nothing').toBeGreaterThan(-1);
  const body = source.slice(source.indexOf('run: |', at) + 'run: |\n'.length);
  const lines: string[] = [];
  for (const line of body.split('\n')) {
    if (line.trim() !== '' && !line.startsWith('          ')) break;
    lines.push(line.slice(10));
  }
  return lines.join('\n');
}

interface Update {
  dependencyName: string;
  dependencyType: string;
  updateType: string;
  packageEcosystem: string;
}

const npm = (dependencyName: string, dependencyType: string, updateType: string): Update => ({
  dependencyName,
  dependencyType,
  updateType: `version-update:semver-${updateType}`,
  packageEcosystem: 'npm_and_yarn',
});
const action = (dependencyName: string, updateType: string): Update => ({
  dependencyName,
  dependencyType: 'direct:production',
  updateType: `version-update:semver-${updateType}`,
  packageEcosystem: 'github_actions',
});

/**
 * fetch-metadata's `updated-dependencies-json` for every PR the cases ask about, by name. A
 * string is passed as it is, so the cases can hand the step something that is not JSON.
 */
const PRS: Record<string, Update[] | string> = {
  'dev-group': [npm('eslint', 'direct:development', 'minor'), npm('tsx', 'direct:development', 'patch'), npm('zod', 'indirect', 'patch')],
  'action-patch': [action('actions/checkout', 'patch')],
  'action-minor': [action('codecov/codecov-action', 'minor')],
  'action-major': [action('actions/checkout', 'major')],
  // #571's shape: sixteen development bumps and `fumadocs-mdx`/`posthog-js` in a docs app.
  'group-with-production': [npm('eslint', 'direct:development', 'minor'), npm('posthog-js', 'direct:production', 'minor')],
  'group-with-major': [npm('tsx', 'direct:development', 'patch'), npm('vitest', 'direct:development', 'major')],
  'empty-list': [],
  'empty-string': '',
  'not-json': 'not json',
  'no-update-type': [{ ...npm('tsx', 'direct:development', 'patch'), updateType: '' }],
};

/**
 * windows-lane-holds R6 — the step runs for every PR above inside one `bash` started from Node,
 * in `beforeAll` (`scripts/step-scenarios.ts`, which says why). On run 40513685943's Windows
 * cell the first case, then one `bash` per call, took 29,691 ms of its 30,000.
 */
let answers: Record<string, { merge: string; trace: string }>;
beforeAll(() => {
  const scenarios = Object.fromEntries(Object.entries(PRS).map(([name, updates]) => [name, { env: { UPDATES: typeof updates === 'string' ? updates : JSON.stringify(updates) } }]));
  const runs = runStepScenarios(scratchDir('dependabot-automerge-'), { script: decideScript(), variables: ['UPDATES'], scenarios, env: process.env });
  answers = Object.fromEntries(Object.entries(runs).map(([name, { output, trace }]) => [name, { merge: (/^merge=(.*)$/m.exec(output)?.[1] ?? '').trim(), trace }]));
}, 120_000);

/** The step's `merge=` answer for one of {@link PRS}, with its trace as the message when it is wrong. */
function expectMerge(name: keyof typeof PRS & string, expected: 'true' | 'false'): void {
  const { merge, trace } = answers[name] ?? { merge: '', trace: 'no answer' };
  expect(merge, merge === expected ? undefined : trace).toBe(expected);
}

describe('dependabot-automerge: which PRs get auto-merge', () => {
  it('merges a group of patch and minor development bumps', () => {
    expectMerge('dev-group', 'true');
  });

  it('merges a GitHub Actions patch or minor, which Dependabot always types direct:production', () => {
    expectMerge('action-patch', 'true');
    expectMerge('action-minor', 'true');
  });

  it('does not merge a GitHub Actions major', () => {
    expectMerge('action-major', 'false');
  });

  it('does not merge a group when one entry is a direct production dependency, even a patch', () => {
    expectMerge('group-with-production', 'false');
  });

  it('does not merge a group when one entry is a major', () => {
    expectMerge('group-with-major', 'false');
  });

  it('does not merge what it cannot read: an empty list, no JSON, or an entry with no update type', () => {
    expectMerge('empty-list', 'false');
    expectMerge('empty-string', 'false');
    expectMerge('not-json', 'false');
    expectMerge('no-update-type', 'false');
  });

  it('R6 — starts the step\'s shell once per file, and every PR got an answer from it', () => {
    expect(bashSpawns()).toBe(1);
    expect(Object.entries(answers).filter(([, { trace }]) => !/^exit \d+$/mu.test(trace)).map(([name]) => name)).toEqual([]);
  });
});
