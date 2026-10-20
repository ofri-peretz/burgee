import { defineConfig } from 'vitest/config';

// One coverage policy for the whole family — see `vitest-coverage.config.ts` for why the
// exclusion list is what it is. Inlining it in four places is how that list silently drifts.
import { coverage } from '../../vitest-coverage.config.js';
import { timeouts } from '../../vitest-timeouts.config.js';

/**
 * windows-lane-holds R3c — the files that drive a real shell (`bash`, `zsh`, `fish`, `pwsh`).
 * The same `pwsh` call took 13.7–59.7 s inside the parallel pool on a full Windows cell and
 * 0.9–2.3 s on a lighter one, so these run after the pool, one file at a time.
 * `scripts/vitest-pool-lock.test.ts` fails when a test file here spawns a shell and is not listed.
 */
export const SHELL_DRIVING = ['src/completions-shells.test.ts', 'src/completions-dynamic.test.ts'];

/**
 * The shared policy decides what is measured; this package gates the result. Every line in the
 * denominator has a test that fails when the line is broken, and code no test could reach was
 * deleted rather than excused — so a new line without a test is a red run, not a quiet slip.
 */
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
    setupFiles: ['../../vitest-colour-setup.ts'],
    // The run leaves `dist/` as the build left it, or fails naming what changed.
    // And it tells a timing test whether the code it times is instrumented (`migrate-bench`).
    globalSetup: ['../../vitest-dist-guard.ts', './src/__fixtures__/coverage-flag.ts'],
    coverage: { ...coverage, thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 } },
    // One `vitest run`, two groups: the pool first, then the shell-driving files alone. `include`
    // lives in each project, not above them: `extends: true` concatenates arrays, so a shared
    // `src/**/*.test.ts` would put every file in the `shells` group too.
    projects: [
      { extends: true, test: { name: 'pool', include: ['src/**/*.test.ts'], exclude: [...SHELL_DRIVING], sequence: { groupOrder: 0 } } },
      { extends: true, test: { name: 'shells', include: [...SHELL_DRIVING], fileParallelism: false, sequence: { groupOrder: 1 } } },
    ],
  },
});
