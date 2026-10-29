import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const here = (file: string): string => fileURLToPath(new URL(file, import.meta.url));

/**
 * SC9: Stryker 10.0.0's own mutator specs (vendor/stryker-mutators, byte for byte) graded
 * against oxmutate's native core. Their imports of Stryker's source resolve here instead.
 */
export default defineConfig({
  root: here('..'),
  resolve: {
    alias: [
      { find: /^(\.\.\/)+src\/mutators\/[a-z-]+-mutator\.js$/, replacement: here('./mutators.ts') },
      { find: /^(\.\.\/)+helpers\/expect-mutation\.js$/, replacement: here('./expect-mutation.ts') },
      // Imported by the one Regex spec that NOT_APPLICABLE skips; nothing calls it.
      { find: /^sinon$/, replacement: here('./not-applicable.ts') },
    ],
  },
  test: {
    globals: true,
    include: ['vendor/stryker-mutators/test/unit/mutators/*.spec.ts'],
    setupFiles: [here('./setup.ts')],
  },
});
