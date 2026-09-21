/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — the Version PR is not missing a changeset.
 *
 * `Changeset present` fails a PR that edits a package's source or manifest and adds no
 * `.changeset` entry. The Version PR does exactly that and is *supposed* to: it
 * consumes the changesets, deleting each one and writing the version it implies. So every
 * release went red on this check and collected a bot comment telling its author to run
 * `npm run changeset` — on a branch no author wrote.
 *
 * A red check on every release is worse than no check. It is the state in which a team
 * learns that red is normal here, and the next red one — a real one — reads the same.
 *
 * This runs the step's own shell rather than matching its text, because the defect was in
 * what the script decided, not in how it was spelled. The release case returns before the
 * script touches git, which is what makes it runnable outside a PR.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW = join(REPO_ROOT, '.github/workflows/changesets-pr.yml');

/**
 * The `Check for changeset` step's `run:` body, dedented.
 *
 * Read as text, the way `scripts/lint-workflows.ts` reads these files: `yaml` is not a
 * dependency of this repo, only something that happens to be under `node_modules` today,
 * and a lock that leans on a transitive install disappears the week the tree is deduped.
 */
function checkScript(): string {
  const source = readFileSync(WORKFLOW, 'utf8');
  const at = source.indexOf('name: Check for changeset');
  expect(at, 'the `Check for changeset` step is gone — this lock is now asserting nothing').toBeGreaterThan(-1);
  const body = source.slice(source.indexOf('run: |', at) + 'run: |\n'.length);
  const lines: string[] = [];
  for (const line of body.split('\n')) {
    if (line.trim() !== '' && !line.startsWith('          ')) break;
    lines.push(line.slice(10));
  }
  return lines.join('\n');
}

/** Run the step with a given environment and return what it wrote to `$GITHUB_OUTPUT`. */
function statusFor(env: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'changeset-check-'));
  const script = join(dir, 'check.sh');
  const out = join(dir, 'output');
  writeFileSync(script, checkScript());
  writeFileSync(out, '');
  execFileSync('bash', [script], { cwd: dir, env: { ...process.env, ...env, GITHUB_OUTPUT: out }, stdio: 'pipe' });
  return (/^status=(.*)$/m.exec(readFileSync(out, 'utf8'))?.[1] ?? '').trim();
}

describe('the changeset check and the Version PR', () => {
  it('answers `release` for the branch changesets pushes, before it looks at any diff', () => {
    // No BASE_SHA or HEAD_SHA: reaching the diff without them answers `not-needed`, which
    // is what this assertion catches, and on a real Version PR — where the SHAs are set and
    // a `package.json` moved per bump — reaching the diff answers `missing` and goes red.
    // Either way the wrong branch was taken, and `release` can only come from the guard.
    expect(statusFor({ HEAD_REF: 'changeset-release/main', LABELS: '' })).toBe('release');
  });

  it('still answers `skipped` for the label, which the release case must not have displaced', () => {
    expect(statusFor({ HEAD_REF: 'fix/whatever', LABELS: 'skip-changeset,other' })).toBe('skipped');
  });

  it('fails only on `missing`, so `release` cannot go red however it is reached', () => {
    const source = readFileSync(WORKFLOW, 'utf8');
    const failing = source.slice(source.indexOf('name: Fail when the changeset is missing'));
    expect(/^\s*if: steps\.check\.outputs\.status == 'missing'$/m.test(failing.split('run:')[0] ?? '')).toBe(true);
  });
});
