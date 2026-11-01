/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Git-env lock — no root test sees a GIT_* variable, so no test's `git init` can reach the
 * developer's repository (see vitest-git-env-setup.ts).
 *
 * Proven red, 2026-10-18: with `GIT_DIR=<a scratch repo>/.git` exported, as lefthook's pre-push
 * does, this case and all 24 cases of `scripts/affected.test.ts` failed without the setup file
 * (25 failures); with it, 34/34 pass. From a worktree's pre-push (GIT_DIR inside
 * `.git/worktrees/`) the same `git init` set `core.bare = true` on the real repository. In CI
 * and from a plain shell nothing is exported, so this can only fail where the bug can bite.
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('root tests run without the caller git environment', () => {
  it('no GIT_* variable reaches a test, whatever hook launched the suite', () => {
    expect(Object.keys(process.env).filter((key) => key.startsWith('GIT_'))).toEqual([]);
  });

  // setupFiles run in the workers, after the main process has loaded the config and started any
  // globalSetup; a git call there still saw pre-push's GIT_DIR. Importing the setup from the config
  // clears it in the main process, so every worker and child it spawns starts clean.
  it('the root config clears the git environment in the main process too', () => {
    expect(read('vitest.root.config.ts')).toMatch(/^dropGitEnv\(\);$/mu);
  });

  // The changed-lines lane runs package suites through oxmutate, not turbo, so turbo's strict env
  // never strips GIT_DIR. From pre-push, a package test's `git init` (oxmutate's lanes.test.ts,
  // compat-oracle's vendor tests) then set core.bare = true on the shared repository (2026-11-01).
  it('the changed-lines lane unsets every GIT_* variable before it runs anything', () => {
    const script = read('scripts/mutation-changed.sh');
    const unset = script.indexOf("compgen -e | grep '^GIT_'");
    expect(unset).toBeGreaterThan(script.indexOf('set -euo pipefail'));
    expect(unset).toBeLessThan(script.indexOf('git fetch --quiet'));
  });
});
