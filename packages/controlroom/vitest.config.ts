import { defineConfig } from 'vitest/config';

// One coverage policy for the whole family — see `vitest-coverage.config.ts` for why the
// exclusion list is what it is. Inlining it in four places is how that list silently drifts.
import { coverage } from '../../vitest-coverage.config.js';
import { timeouts } from '../../vitest-timeouts.config.js';

// The family's bar: every line, branch, function and statement covered, so a suite that stops
// covering its source fails here instead of drifting (controlroom had no thresholds until 2026-10-05).
const FULL = { lines: 100, branches: 100, functions: 100, statements: 100 };

export default defineConfig({
  // Pinned before there are tests to pin: a config that inherits the shell is a bug waiting
  // for its first assertion. See `vitest-colour-setup.ts`.
  test: { ...timeouts,
    // `shape.test.ts` packs the tarball and installs it, so its tests spawn and wait.
    // Vitest's 5s default was never a timeout for that shape, only a bet on the machine;
    // see `benchmarks/vitest.config.ts` for the measurements.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    include: ['src/**/*.test.ts'], setupFiles: ['../../vitest-colour-setup.ts'], coverage: { ...coverage, thresholds: FULL },
  },
});
