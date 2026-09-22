import { defineConfig } from 'vitest/config';

// One coverage policy for the whole family — see `vitest-coverage.config.ts` for why the
// exclusion list is what it is. Inlining it in four places is how that list silently drifts.
import { coverage } from '../../vitest-coverage.config.js';
import { timeouts } from '../../vitest-timeouts.config.js';

export default defineConfig({
  // The colour environment is pinned before anything imports: `roundel/chalk` detects the
  // terminal at import, so a developer's `FORCE_COLOR` would otherwise decide ten assertions.
  test: { ...timeouts,
    // Tests here spawn something and wait for it — a tarball install, `npm i`, a stub CLI,
    // an incumbent's suite in a child process. Vitest's 5s default was never a timeout for
    // that shape, only a bet on the machine; see `benchmarks/vitest.config.ts` for the
    // measurements. 60s is above the largest ceiling any subject sets for itself.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    include: ['src/**/*.test.ts'], setupFiles: ['../../vitest-colour-setup.ts'], coverage,
  },
});
