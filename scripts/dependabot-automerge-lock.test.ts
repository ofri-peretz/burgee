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
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

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

/** Run the step on fetch-metadata's `updated-dependencies-json` and return its `merge=` answer. */
function mergeFor(updates: Update[] | string): string {
  const dir = mkdtempSync(join(tmpdir(), 'dependabot-automerge-'));
  const script = join(dir, 'decide.sh');
  const out = join(dir, 'output');
  writeFileSync(script, decideScript());
  writeFileSync(out, '');
  const UPDATES = typeof updates === 'string' ? updates : JSON.stringify(updates);
  execFileSync('bash', [script], {
    cwd: dir,
    env: { ...process.env, UPDATES, GITHUB_OUTPUT: out, GITHUB_STEP_SUMMARY: join(dir, 'summary') },
    stdio: 'pipe',
  });
  return (/^merge=(.*)$/m.exec(readFileSync(out, 'utf8'))?.[1] ?? '').trim();
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

describe('dependabot-automerge: which PRs get auto-merge', () => {
  it('merges a group of patch and minor development bumps', () => {
    expect(mergeFor([npm('eslint', 'direct:development', 'minor'), npm('tsx', 'direct:development', 'patch'), npm('zod', 'indirect', 'patch')])).toBe('true');
  });

  it('merges a GitHub Actions patch or minor, which Dependabot always types direct:production', () => {
    expect(mergeFor([action('actions/checkout', 'patch')])).toBe('true');
    expect(mergeFor([action('codecov/codecov-action', 'minor')])).toBe('true');
  });

  it('does not merge a GitHub Actions major', () => {
    expect(mergeFor([action('actions/checkout', 'major')])).toBe('false');
  });

  it('does not merge a group when one entry is a direct production dependency, even a patch', () => {
    // #571's shape: sixteen development bumps and `fumadocs-mdx`/`posthog-js` in a docs app.
    expect(mergeFor([npm('eslint', 'direct:development', 'minor'), npm('posthog-js', 'direct:production', 'minor')])).toBe('false');
  });

  it('does not merge a group when one entry is a major', () => {
    expect(mergeFor([npm('tsx', 'direct:development', 'patch'), npm('vitest', 'direct:development', 'major')])).toBe('false');
  });

  it('does not merge what it cannot read: an empty list, no JSON, or an entry with no update type', () => {
    expect(mergeFor([])).toBe('false');
    expect(mergeFor('')).toBe('false');
    expect(mergeFor('not json')).toBe('false');
    expect(mergeFor([{ ...npm('tsx', 'direct:development', 'patch'), updateType: '' }])).toBe('false');
  });
});
