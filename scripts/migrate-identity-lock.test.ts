/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — `burgee migrate`'s table of error classes is what each drop-in actually exports.
 *
 * `IDENTITY` (U12-4, D-20261008-migrate-u12-findings) decides which imports stay on an
 * incumbent that another dependency still installs: an `ExitPromptError` from caique is not
 * `instanceof` the one `@inquirer/confirm` throws, so an import that names it must not move.
 * `migrate.ts` cannot import the targets to find out — it would depend on every family package —
 * so the table is data, and this imports every target the mapping can produce and holds the
 * table equal to the `Error` subclasses each one exports. A class added to a drop-in without a
 * row here would move silently and split; a row for a class that is gone would hold for nothing.
 */
import { describe, expect, it } from 'vitest';

// eslint-disable-next-line import-next/no-relative-packages -- by path, for the same reason as migrate-drop-ins-lock.test.ts: `migrate.ts` is not an export
import { IDENTITY, MAPPING } from '../packages/burgee/src/migrate.js';

const TARGETS = [...new Set(Object.values(MAPPING))].sort();

/** The exports of `target` that are classes extending `Error`, sorted. */
async function errorClasses(target: string): Promise<string[]> {
  // eslint-disable-next-line node-security/no-dynamic-dependency-loading -- every specifier is a value of MAPPING, a constant table
  const module = (await import(target)) as Record<string, unknown>;
  return Object.entries(module)
    .filter(([, value]) => typeof value === 'function' && (value as { prototype?: unknown }).prototype instanceof Error)
    .map(([name]) => name)
    .sort();
}

describe('IDENTITY is every error class each drop-in exports', () => {
  it('names only targets the mapping produces', () => {
    expect(Object.keys(IDENTITY).filter((target) => !TARGETS.includes(target))).toEqual([]);
  });

  it.each(TARGETS)('%s', async (target) => {
    expect(await errorClasses(target)).toEqual([...(IDENTITY[target] ?? [])].sort());
  });
});
