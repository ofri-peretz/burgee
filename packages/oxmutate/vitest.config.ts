import { defineConfig } from 'vitest/config';

// One coverage policy and one set of clocks for the whole family (see the configs for why).
import { coverage } from '../../vitest-coverage.config.js';
import { timeouts } from '../../vitest-timeouts.config.js';

export default defineConfig({
  test: {
    ...timeouts,
    // The end-to-end tests run the built CLI on a fixture project, which starts Vitest servers
    // in child processes; one deliberately stalls for 6 s twice. 90 s covers the slowest.
    testTimeout: 90_000,
    include: ['src/**/*.test.ts'],
    setupFiles: ['../../vitest-colour-setup.ts'],
    // No thresholds yet: the coordinator, scheduler and child server run in the processes the
    // end-to-end tests spawn, which in-process coverage cannot see. The floor comes with a
    // first measured run (see .sdlc/intents/oxmutate/m1-results.md).
    coverage,
  },
});
