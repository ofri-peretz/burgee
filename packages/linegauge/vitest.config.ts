import { defineConfig } from 'vitest/config';

// One coverage policy for the whole family — see `vitest-coverage.config.ts` for why the
// exclusion list is what it is. Inlining it in four places is how that list silently drifts.
import { coverage } from '../../vitest-coverage.config.js';
import { timeouts } from '../../vitest-timeouts.config.js';

/**
 * The shared policy decides what is measured; this package gates the result. Every line and
 * branch in the denominator has a test that fails when it is broken, and code no test could
 * reach was deleted rather than excused — so a new line or branch without a test is a red run,
 * not a quiet slip. All four are 100, with no per-file exception: the last 20 misses were `??`
 * fallbacks in `width.ts` and `wrap.ts` for values that are always there (an in-range index,
 * the code point of a non-empty string, a named group), and they were deleted once burgee#685
 * had rewritten both files.
 */
const FULL = { lines: 100, branches: 100, functions: 100, statements: 100 };

export default defineConfig({
  // The colour environment is pinned before anything imports: `roundel/chalk` detects the
  // terminal at import, so a developer's `FORCE_COLOR` would otherwise decide ten assertions.
  test: {
    ...timeouts,
    include: ['src/**/*.test.ts'],
    setupFiles: ['../../vitest-colour-setup.ts'],
    coverage: { ...coverage, thresholds: FULL },
  },
});
