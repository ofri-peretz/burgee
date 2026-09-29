import { defineConfig } from 'vitest/config';

// One coverage policy for the whole family — see `vitest-coverage.config.ts` for why the
// exclusion list is what it is. Inlining it in four places is how that list silently drifts.
import { coverage } from '../../vitest-coverage.config.js';
import { timeouts } from '../../vitest-timeouts.config.js';

export default defineConfig({
  // Pinned before there are tests to pin: a config that inherits the shell is a bug waiting
  // for its first assertion. See `vitest-colour-setup.ts`.
  test: {
    ...timeouts,
    include: ['src/**/*.test.ts'],
    setupFiles: ['../../vitest-colour-setup.ts'],
    // Every line seniority owns the tests for is reached — the drop-ins included, since none of
    // them is on the shared exclusion list — so the floor is the whole of it: a line added
    // without a test fails `npm run coverage` here rather than lowering a number.
    coverage: { ...coverage, thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 } },
  },
});
