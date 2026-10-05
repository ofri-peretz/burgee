import { defineConfig } from 'vitest/config';

import { timeouts } from '../../vitest-timeouts.config.js';

export default defineConfig({
  test: { ...timeouts, include: ['tests/**/*.test.ts'] },
});
