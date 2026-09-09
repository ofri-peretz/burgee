import { defineConfig, mergeConfig } from 'vitest/config';

import root from './vitest.root.config.js';

/**
 * What a bare `vitest run` at the root means.
 *
 * Without this file it means "every test file anywhere below here", which
 * includes the agent worktrees under `.claude/` — 2,961 files, most of them
 * copies of the same suites, thousands of them stale. The real entry points are
 * `npm test` (these locks, then every package through turbo) and each package's
 * own config; this makes the bare command agree with the first of them instead
 * of finding its own answer.
 */
export default mergeConfig(
  root,
  defineConfig({ test: { exclude: ['**/node_modules/**', '**/dist/**', '.claude/**'] } }),
);
