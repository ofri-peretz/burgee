import { defineConfig } from 'vitest/config';

// One coverage policy for the whole family — see `vitest-coverage.config.ts` for why the
// exclusion list is what it is. Inlining it in four places is how that list silently drifts.
import { coverage } from '../../vitest-coverage.config.js';
import { timeouts } from '../../vitest-timeouts.config.js';

/**
 * The shared policy decides what is measured; this package gates the result. Every line in the
 * denominator has a test that fails when the line is broken, and code no test could reach was
 * deleted rather than excused — so a new line without a test is a red run, not a quiet slip.
 *
 * All four are 100 but branches, and the exception is held open on purpose: five `??` and `?:`
 * arms in `help.ts`, `surfaces.ts` and `contrast.ts` that no input reaches — a child's last
 * path word, an env name filtered to be present, a wrapped line's first row, a typed word in a
 * non-empty list, a zero-width span between two stops the loop has already stepped past. All
 * three files are being edited by burgee#678, so deleting them here would conflict with it. The
 * global branch figure is pinned to exactly what is reached (2118 of 2123), and every *other*
 * file is held at 100 by the two globs, which keeps the exception from absorbing a regression
 * anywhere else. After #678 lands, delete the five and set `branches` to 100.
 */
const FULL = { lines: 100, branches: 100, functions: 100, statements: 100 };

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
    include: ['src/**/*.test.ts'], setupFiles: ['../../vitest-colour-setup.ts'],
    coverage: { ...coverage, thresholds: { ...FULL, branches: 99.76, 'src/!(help|surfaces|contrast).ts': FULL, 'src/{meow,yargs}/*.ts': FULL } },
  },
});
