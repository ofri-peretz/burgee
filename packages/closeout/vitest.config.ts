import { defineConfig } from 'vitest/config';

// One coverage policy for the whole family — see `vitest-coverage.config.ts` for why the
// exclusion list is what it is. Inlining it in four places is how that list silently drifts.
import { coverage } from '../../vitest-coverage.config.js';

export default defineConfig({
  // Pinned before there are tests to pin: a config that inherits the shell is a bug waiting
  // for its first assertion. See `vitest-colour-setup.ts`.
  test: { include: ['src/**/*.test.ts'], setupFiles: ['../../vitest-colour-setup.ts']  },
});
