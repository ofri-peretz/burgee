/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The root suite runs straight from lefthook's pre-push, where git exports GIT_DIR (and, from a
 * worktree, a GIT_DIR inside `.git/worktrees/`). A lock that builds a throwaway repository with
 * `spawnSync('git', ['init'])` inherits it and re-initialises the developer's own repository as
 * bare — `core.bare = true` in the shared `.git/config`, after which every worktree fails with
 * "must be run in a work tree" (2026-10-18, from scripts/affected.test.ts). Package suites run
 * through turbo's strict env mode and never see these; the root suite needs it said once, here.
 */
for (const key of Object.keys(process.env)) if (key.startsWith('GIT_')) delete process.env[key];
