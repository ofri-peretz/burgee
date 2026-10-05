import { defineConfig } from 'vitest/config';

// The family's clocks, not vitest's 10 s default: `examples.test.ts` runs every docs example
// in a scratch install and removes those trees in `afterAll`, which under the pre-push battery
// ran past 10 s in a different app on every push of 2026-10-05.
import { timeouts } from '../../vitest-timeouts.config.js';

export default defineConfig({
  test: { ...timeouts, include: ['src/**/*.test.ts'] },
});
