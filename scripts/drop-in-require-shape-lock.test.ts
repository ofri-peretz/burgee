/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — `require()` of a drop-in hands a CommonJS caller what `require()` of its incumbent does.
 *
 * `require()` of an ES module returns its namespace. `cross-spawn` and `cli-table3` are
 * CommonJS whose `module.exports` is a function, so `const spawn = require('cross-spawn')`
 * and `spawn.sync(...)` are how most of their callers use them — and `require('bellpull/cross-spawn')`
 * returned an object with a `default` on it, so the same line threw `spawn is not a function`.
 * The oracle never saw it: its shim re-exported the default as `'module.exports'` for the
 * graded suite, supplying the behaviour it was grading (2026-09-23). The packages now export it
 * themselves, and this checks it from outside, with Node's own `require`.
 *
 * For every pair whose incumbent is installed here: the two `require()` results are the same
 * kind of value, and when the incumbent's is a function, every property it carries is on ours.
 */
import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

const require = createRequire(new URL('../package.json', import.meta.url));

/** Incumbent → drop-in, for the drop-ins `burgee migrate` can produce. */
const PAIRS: readonly (readonly [string, string])[] = [
  ['yargs', 'burgee/yargs'],
  ['chalk', 'roundel/chalk'],
  ['ansi-escapes', 'paratext'],
  ['ora', 'flagstaff/ora'],
  ['log-update', 'flagstaff/log-update'],
  ['boxen', 'flagstaff/boxen'],
  ['cli-table3', 'flagstaff/cli-table3'],
  ['string-width', 'linegauge'],
  ['strip-ansi', 'linegauge/strip'],
  ['wrap-ansi', 'linegauge/wrap'],
  ['slice-ansi', 'linegauge/slice'],
  ['cross-spawn', 'bellpull/cross-spawn'],
  ['which', 'bellpull/node-which'],
  ['restore-cursor', 'closeout/restore-cursor'],
  ['exit-hook', 'closeout/exit-hook'],
  ['signal-exit', 'closeout/signal-exit'],
  ['dotenv', 'seniority/dotenv'],
  ['rc', 'seniority/rc'],
];

/** What `require()` returns, or `undefined` when the specifier is not installed here. */
function required(specifier: string): unknown {
  try {
    // eslint-disable-next-line import-next/no-dynamic-require, import-next/no-commonjs, node-security/no-dynamic-require, node-security/no-dynamic-dependency-loading -- a CommonJS require() is the thing under test, and every specifier is a constant in PAIRS above
    return require(specifier) as unknown;
  } catch {
    return undefined;
  }
}

/** The shape a caller relies on: a function or an object, and whether it is an ES namespace. */
function kind(value: unknown): string {
  if (typeof value === 'function') return 'function';
  return value !== null && typeof value === 'object' && 'default' in value ? 'namespace' : typeof value;
}

const installed = PAIRS.filter(([incumbent]) => required(incumbent) !== undefined);

describe('require() of a drop-in matches require() of its incumbent', () => {
  it('finds the CommonJS incumbents installed, so the comparison cannot pass vacuously', () => {
    // The three the lockfile installs at the root. dotenv and rc are checked when present; in a
    // clean install they are not, and the oracle grades them through require() instead — its
    // shim no longer supplies 'module.exports', so dotenv falls to 74 / 141 without it.
    expect(installed.map(([incumbent]) => incumbent)).toEqual(expect.arrayContaining(['yargs', 'cross-spawn', 'cli-table3']));
  });

  it.each(installed)('require(%s) and require(%s) are the same kind of value', (incumbent, ours) => {
    expect(kind(required(ours))).toBe(kind(required(incumbent)));
  });

  it.each(installed.filter(([incumbent]) => typeof required(incumbent) === 'function'))('%s → %s carries every property the incumbent\'s function does', (incumbent, ours) => {
    // `in`, not `Object.keys`, on ours: a class's static methods (cli-table3's `reset`) are
    // not enumerable, and a caller reaches them all the same.
    const mine = required(ours) as object;
    expect(Object.keys(required(incumbent) as object).filter((key) => !(key in mine))).toEqual([]);
  });
});
