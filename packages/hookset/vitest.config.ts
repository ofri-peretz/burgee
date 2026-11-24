import { defineConfig } from 'vitest/config';

import { coverage } from '../../vitest-coverage.config.js';
import { timeouts } from '../../vitest-timeouts.config.js';

export default defineConfig({
  test: {
    ...timeouts,
    include: ['src/**/*.test.ts'],
    setupFiles: ['../../vitest-colour-setup.ts'],
    // The Claude pack runs in child processes (claude.test.ts), which in-process coverage cannot
    // see; everything else is held at 100%, as every package at 1.0 is.
    coverage: { ...coverage, thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 } },
  },
});
