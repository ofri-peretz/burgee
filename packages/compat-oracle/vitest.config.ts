import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The colour environment is pinned before anything imports: `roundel/chalk` detects the
  // terminal at import, so a developer's `FORCE_COLOR` would otherwise decide ten assertions.
  test: { include: ['src/**/*.test.ts'], setupFiles: ['../../vitest-colour-setup.ts'] },
});
