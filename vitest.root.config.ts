// Before anything else: clears pre-push's GIT_* in the main process, so a globalSetup or any
// child it spawns cannot `git init` into the developer's repository (git-env-lock.test.ts).
import './vitest-git-env-setup.ts';

import { defineConfig } from 'vitest/config';

import { timeouts } from './vitest-timeouts.config.js';

/** Root project: the SDLC locks and the evals. Package suites run through turbo. */
export default defineConfig({
  // Same pinning as every package: a root lock that renders colour must not depend on the
  // shell it was run from either.
  test: { ...timeouts, include: ['scripts/**/*.test.ts'], setupFiles: ['./vitest-git-env-setup.ts', './vitest-colour-setup.ts'] },
});
