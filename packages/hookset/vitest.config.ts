import { defineConfig } from 'vitest/config';

import { coverage } from '../../vitest-coverage.config.js';
import { timeouts } from '../../vitest-timeouts.config.js';

export default defineConfig({
  test: {
    ...timeouts,
    include: ['src/**/*.test.ts'],
    setupFiles: ['../../vitest-colour-setup.ts'],
    // The first measured run (2026-11-23), as a floor that only rises: `bin.ts` is one line run
    // only as a process, and the uncovered branches are core.ts's defensive reads of a malformed
    // lefthook.yml or settings.json. The Claude pack runs in child processes (claude.test.ts),
    // which in-process coverage cannot see.
    coverage: { ...coverage, thresholds: { lines: 99, branches: 89, functions: 100, statements: 97 } },
  },
});
