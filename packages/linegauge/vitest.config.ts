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
 * All four are 100, with one exception held open on purpose: branches in `width.ts` and
 * `wrap.ts`. Their 21 missing branches are all `??` fallbacks for a value that is always there
 * — an in-range index, a named group — and both files are being rewritten in burgee#685, so
 * deleting them here would conflict with it. The global branch figure is therefore pinned to
 * exactly what is reached (580 of 601), and every *other* file is held at 100 by the glob
 * below, which keeps the exception from absorbing a regression anywhere else. After #685
 * lands, delete the fallbacks and set `branches` to 100.
 */
const FULL = { lines: 100, branches: 100, functions: 100, statements: 100 };

export default defineConfig({
  // The colour environment is pinned before anything imports: `roundel/chalk` detects the
  // terminal at import, so a developer's `FORCE_COLOR` would otherwise decide ten assertions.
  test: {
    ...timeouts,
    include: ['src/**/*.test.ts'],
    setupFiles: ['../../vitest-colour-setup.ts'],
    coverage: { ...coverage, thresholds: { ...FULL, branches: 96.5, 'src/!(width|wrap).ts': FULL } },
  },
});
