/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — burgee's first example fits on one screen: 15 lines or fewer (`burgee/spec.md` Z4).
 *
 * Z4 promised the first example in the README is short enough to read before deciding, and named
 * a lock for it. Its no-build half was held by `packages/burgee/src/shape.test.ts`; the length
 * was held by nothing until 2026-10-19, so an example could grow a line at a time with every
 * test green. This counts the lines of the first source block — `js`, `mjs`, `ts` — in the root
 * README and in `packages/burgee/README.md`, the one npm shows. Comments and blank lines count:
 * a reader reads them too.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

/** The Z4 ceiling. */
export const MAX_FIRST_EXAMPLE_LINES = 15;

const SOURCE_FENCE = /^```(?:js|mjs|ts|javascript|typescript)\s*$/u;

/** The body of a README's first source block, or `undefined` when it has none. */
export function firstExample(readme: string): string[] | undefined {
  const lines = readme.split(/\r?\n/u);
  const start = lines.findIndex((line) => SOURCE_FENCE.test(line));
  if (start === -1) return undefined;
  const end = lines.findIndex((line, i) => i > start && line.startsWith('```'));
  return end === -1 ? undefined : lines.slice(start + 1, end);
}

describe('burgee’s first example is 15 lines or fewer (Z4)', () => {
  it.each(['README.md', 'packages/burgee/README.md'])('%s', (file) => {
    const example = firstExample(readFileSync(join(ROOT, file), 'utf8'));
    expect(example, `${file} has no js/mjs/ts example`).toBeDefined();
    expect(example!.length, `${file}'s first example is ${String(example!.length)} lines`).toBeLessThanOrEqual(MAX_FIRST_EXAMPLE_LINES);
  });

  it('counts the first source block, not the console transcript after it', () => {
    const readme = ['# x', '```console', '$ a', '$ b', '```', '```js', 'one();', '', '// two', '```', '```js', 'later();', '```'].join('\n');
    expect(firstExample(readme)).toEqual(['one();', '', '// two']);
  });

  it('fails a sixteen-line example', () => {
    const readme = ['```js', ...Array.from({ length: MAX_FIRST_EXAMPLE_LINES + 1 }, (_, i) => `line${String(i)}();`), '```'].join('\n');
    expect(firstExample(readme)!.length).toBeGreaterThan(MAX_FIRST_EXAMPLE_LINES);
  });
});
