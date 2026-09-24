/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — no source file but the bin imports `cli.js`.
 *
 * `cli.ts` ends in `run(program)`, so importing it runs burgee's own CLI against whatever
 * argv the importer has. `option-key-canonical.test.ts` imported `program` from it; under
 * vitest that parsed the worker's argv, refused it, and called `process.exit(2)` — reported
 * as an unhandled error that failed the run intermittently, on Windows most often. The
 * commands live in `program.ts`, which has no side effect.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('.', import.meta.url));
const IMPORTS_CLI = /from\s+['"]\.\/cli\.js['"]|import\(\s*['"]\.\/cli\.js['"]\s*\)/u;

describe('cli.js is imported by nothing', () => {
  it('no file under src/ imports ./cli.js', () => {
    const importers = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
      .filter((f) => /\.tsx?$/u.test(f) && !f.endsWith('program-import-lock.test.ts'))
      .filter((f) => IMPORTS_CLI.test(readFileSync(join(SRC, f), 'utf8')));
    expect(importers).toEqual([]);
  });
});
