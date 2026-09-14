import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Tests here spawn something and wait for it, or time one run against another. Vitest's
    // 5s default was never a timeout for that shape, only a bet on the machine; see
    // `benchmarks/vitest.config.ts` for the measurements. 60s is above the largest ceiling
    // any subject sets for itself, so a genuine hang still fails.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    include: ['src/**/*.test.ts'],
  },
});
