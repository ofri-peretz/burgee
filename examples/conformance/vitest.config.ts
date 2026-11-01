import { defineConfig } from 'vitest/config';

// The five-second per-case gate (D-20261101-tests-under-5s); this config sets its own clocks below.
import { caseBudget } from '../../vitest-timeouts.config.js';

export default defineConfig({
  test: {
    // Tests here spawn something and wait for it, or time one run against another. Vitest's
    // 5s default was never a timeout for that shape, only a bet on the machine; see
    // `benchmarks/vitest.config.ts` for the measurements. 60s is above the largest ceiling
    // any subject sets for itself, so a genuine hang still fails.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    ...caseBudget,
    include: ['src/**/*.test.ts'],
  },
});
