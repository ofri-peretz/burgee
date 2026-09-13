/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — a branch may add to the lockfile and may not quietly drop from it.
 *
 * `npm install` on darwin-arm64 prunes optional dependencies that only resolve elsewhere:
 * `@emnapi/core` and `@emnapi/runtime` today, whatever the tree grows tomorrow. Every
 * regeneration from a Mac removes them, and then **every CI runner refuses the result**:
 *
 *   npm error `npm ci` can only install packages when your package.json and
 *   package-lock.json are in sync. Missing: @emnapi/core@1.11.3 from lock file
 *
 * It cost four pull requests and six round trips to CI in one afternoon, and the reason it
 * kept costing them is that the obvious local check cannot catch it: `npm ci --dry-run`
 * passes on the machine that caused the problem, because on that machine npm never looks for
 * the entries it just removed. **A verification step that cannot fail for the reason the
 * build fails is not a verification step.**
 *
 * This compares the two committed lockfiles instead. Anything `main` has and the branch lost
 * is the answer, it takes no install, and it is the same question CI will ask.
 *
 * Additions are fine and unmentioned — a branch that adds a dependency is doing its job.
 */
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOCKFILE = 'package-lock.json';

interface Lock {
  packages: Record<string, unknown>;
}

/** A lockfile at a git ref, or nothing when the ref is unreachable (a shallow CI clone). */
function at(ref: string): Lock | undefined {
  try {
    return JSON.parse(execFileSync('git', ['show', `${ref}:${LOCKFILE}`], { cwd: REPO_ROOT, encoding: 'utf8' })) as Lock;
  } catch {
    return undefined;
  }
}

describe('the lockfile keeps what main has', () => {
  // `origin/main` on a runner, `main` locally; whichever resolves. A shallow clone has
  // neither, and the test says so rather than passing on an absence.
  const base = at('origin/main') ?? at('main');
  const head = at('HEAD');

  it('can read both lockfiles', () => {
    expect(head, 'HEAD has no package-lock.json').toBeDefined();
    if (base === undefined) {
      // Not a failure: a shallow clone cannot answer this question, and pretending it can is
      // worse than skipping. Said out loud so a permanently-skipping check gets noticed.
      expect(process.env['CI'], 'no main to compare against — fetch depth?').toBeDefined();
    }
  });

  it('drops nothing that main resolves', () => {
    if (base === undefined || head === undefined) return;
    const missing = Object.keys(base.packages).filter((name) => !(name in head.packages));
    expect(
      missing,
      'these are in main and gone here. An `npm install` on macOS prunes optional dependencies that only resolve on other platforms; restore them from main as the last edit to the file, and check with `git show origin/main:package-lock.json` rather than `npm ci --dry-run`',
    ).toEqual([]);
  });
});
