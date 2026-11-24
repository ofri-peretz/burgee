import { defineConfig } from 'vitest/config';

import { coverage } from '../../vitest-coverage.config.js';
import { timeouts } from '../../vitest-timeouts.config.js';

export default defineConfig({
  test: {
    ...timeouts,
    include: ['src/**/*.test.ts'],
    setupFiles: ['../../vitest-colour-setup.ts'],
    coverage: { ...coverage, thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 } },
  },
});
