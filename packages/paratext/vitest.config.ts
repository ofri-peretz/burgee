import { defineConfig } from 'vitest/config';

import { timeouts } from '../../vitest-timeouts.config.js';

export default defineConfig({
  // Pinned before there are tests to pin: a config that inherits the shell is a bug waiting
  // for its first assertion. See `vitest-colour-setup.ts`.
  test: { ...timeouts, include: ['src/**/*.test.ts'], setupFiles: ['../../vitest-colour-setup.ts']  },
});
