import { defineConfig } from 'vitest/config';

/** Root project: the SDLC locks and the evals. Package suites run through turbo. */
export default defineConfig({
  // Same pinning as every package: a root lock that renders colour must not depend on the
  // shell it was run from either.
  test: { include: ['scripts/**/*.test.ts'], setupFiles: ['./vitest-colour-setup.ts'] },
});
