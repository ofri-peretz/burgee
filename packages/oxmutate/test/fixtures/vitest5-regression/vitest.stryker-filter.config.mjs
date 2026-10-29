import { defineConfig } from 'vitest/config';

// The same project with Stryker 10.0.0's test-name filter put back (stryker-name-filter.mjs).
// Only `src/vitest5-regression.test.ts` selects it, to prove the fixture still reproduces the defect.
export default defineConfig({ test: { include: ['src/**/*.spec.ts'], setupFiles: ['./stryker-name-filter.mjs'] } });
