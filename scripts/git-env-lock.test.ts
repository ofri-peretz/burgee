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

import { describe, expect, it } from 'vitest';

describe('root tests run without the caller git environment', () => {
  it('no GIT_* variable reaches a test, whatever hook launched the suite', () => {
    expect(Object.keys(process.env).filter((key) => key.startsWith('GIT_'))).toEqual([]);
  });
});
