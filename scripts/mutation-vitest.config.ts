/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The vitest config a Stryker run uses: the package's own config, unchanged, plus two things.
 *
 *   1. `mutation-vitest-setup.ts`, which makes vitest 5 honour the test filter Stryker sends
 *      (see that file — without it every mutant a `describe` block covers "survives" having run
 *      no test at all).
 *   2. The package's suites that cannot pass against instrumented source, from `SKIPPED_TESTS`
 *      in `scripts/mutation.ts`, each with the reason it is skipped. Only the mutation run
 *      skips them; `npm test` and coverage run every one.
 *
 * `scripts/mutation.ts` sets MUTATION_PACKAGE_DIR and MUTATION_SKIP before it starts Stryker.
 */
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { configDefaults, defineConfig, mergeConfig, type ViteUserConfig } from 'vitest/config';

const packageDir = process.env.MUTATION_PACKAGE_DIR;
if (!packageDir) throw new Error('mutation-vitest.config.ts: MUTATION_PACKAGE_DIR is not set — run it through `npx tsx scripts/mutation.ts`');
const skipped = JSON.parse(process.env.MUTATION_SKIP ?? '[]') as string[];

// eslint-disable-next-line node-security/no-unsafe-dynamic-require, node-security/no-dynamic-dependency-loading -- the package's own committed vitest.config.ts, under the directory scripts/mutation.ts set from a name it checked against packages/
const base = ((await import(pathToFileURL(join(packageDir, 'vitest.config.ts')).href)) as { default: ViteUserConfig }).default;

export default mergeConfig(
  base,
  defineConfig({
    root: packageDir,
    test: {
      setupFiles: [fileURLToPath(new URL('mutation-vitest-setup.ts', import.meta.url))],
      exclude: [...configDefaults.exclude, ...skipped],
    },
  }),
);
