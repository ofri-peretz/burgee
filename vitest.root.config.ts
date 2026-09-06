import { defineConfig } from 'vitest/config';

/** Root project: the SDLC locks and the evals. Package suites run through turbo. */
export default defineConfig({
  test: { include: ['scripts/**/*.test.ts'] },
});
