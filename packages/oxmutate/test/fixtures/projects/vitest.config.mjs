import { defineConfig } from 'vitest/config';

// Two projects, as burgee's config has: each resolves `runner` from its own inline config.
export default defineConfig({
  test: {
    projects: [
      { extends: true, test: { name: 'unit', include: ['src/**/*.spec.ts'] } },
      { extends: true, test: { name: 'none', include: ['nothing/**/*.spec.ts'] } },
    ],
  },
});
