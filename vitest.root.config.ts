import { defineConfig } from 'vitest/config';

import { dropGitEnv } from './vitest-git-env-setup.js';
import { timeouts } from './vitest-timeouts.config.js';

// The setup file below clears pre-push's GIT_* in each worker; this clears it in the main process
// too, so a globalSetup or any child it spawns cannot `git init` into the developer's repository.
dropGitEnv();

/**
 * The root locks that drive a real shell (`bash`, `pwsh`, …), as `scripts/vitest-pool-lock.test.ts`
 * finds them. On the full `windows-latest` cell a shell spawned beside the install-heavy locks
 * (`ink-alias-lock`, `install-graph-lock`: minutes of npm each) is slow by load alone:
 * `changelog-section.test.ts`'s first `bash` call took 19.0 s, then 96.6 s, on #1755, where its
 * other cases take 0.1 s. `packages/burgee/vitest.config.ts` measured the same for `pwsh`
 * (windows-lane-holds R3c), and this is its fix: these files run after the pool, one at a time.
 */
export const SHELL_DRIVING = [
  'scripts/bot-merge-hold-lock.test.ts',
  'scripts/changelog-section.test.ts',
  'scripts/deploy-lock.test.ts',
  'scripts/mutation-changed-lock.test.ts',
  'scripts/mutation-local-only-lock.test.ts',
  'scripts/mutation-lock.test.ts',
  'scripts/release-order-lock.test.ts',
  'scripts/release-verify-lock.test.ts',
  'scripts/specs-workflow-lock.test.ts',
  'scripts/triggerlist-review-action-lock.test.ts',
  'scripts/vercel-apps-lock.test.ts',
];

/** Root project: the SDLC locks and the evals. Package suites run through turbo. */
export default defineConfig({
  // Same pinning as every package: a root lock that renders colour must not depend on the
  // shell it was run from either.
  test: {
    ...timeouts,
    setupFiles: ['./vitest-git-env-setup.ts', './vitest-colour-setup.ts'],
    // Pre-push runs this suite with `--changed`, which follows imports. These locks read hook and
    // CI config as text, so a change there reruns every lock (CI caught three that pre-push missed).
    forceRerunTriggers: ['**/package.json/**', '**/vitest.config.*/**', '**/vite.config.*/**', '**/lefthook.yml', '**/turbo.json', '**/.github/**'],
    // One `vitest run`, two groups, as in `packages/burgee/vitest.config.ts`: `include` lives in
    // each project, since `extends: true` concatenates arrays.
    projects: [
      { extends: true, test: { name: 'pool', include: ['scripts/**/*.test.ts'], exclude: [...SHELL_DRIVING], sequence: { groupOrder: 0 } } },
      { extends: true, test: { name: 'shells', include: [...SHELL_DRIVING], fileParallelism: false, sequence: { groupOrder: 1 } } },
    ],
  },
});
