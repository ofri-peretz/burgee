/**
 * `burgee migrate` moves a `require()` exactly when Node hands the two sides the same kind of
 * value (A29), and `REQUIRE_NAMESPACE` is measured rather than typed.
 *
 * Asked of Node's own `require()` for every installed incumbent in `MAPPING` and its target,
 * so a table that drifts from the packages goes red here. Before A29 every `require()` of an
 * ESM-only incumbent was refused — ten of them then, chalk 6 to exit-hook 5, and ansi-escapes 7 and terminal-link 5 once they were level — although their
 * `require()` already returned the namespace the target returns.
 */
import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

import { MAPPING, REQUIRE_NAMESPACE, rewriteSource } from './migrate.js';

const require = createRequire(new URL('../../../package.json', import.meta.url));

/** What `require()` returns, or `undefined` when the specifier is not installed here. */
function required(specifier: string): unknown {
  try {
    // eslint-disable-next-line import-next/no-dynamic-require, import-next/no-commonjs, node-security/no-dynamic-require, node-security/no-dynamic-dependency-loading -- a CommonJS require() is the thing under test, and every specifier is a key or value of MAPPING
    return require(specifier) as unknown;
  } catch {
    return undefined;
  }
}

/** The shape a caller relies on: a function, an ES namespace, or a plain object. */
function kind(value: unknown): string {
  if (typeof value === 'function') return 'function';
  return value !== null && typeof value === 'object' && 'default' in value ? 'namespace' : typeof value;
}

const installed = Object.entries(MAPPING).filter(([from]) => required(from) !== undefined);

describe('migrate reads require() shapes from Node, not from a guess (A29)', () => {
  it('finds the incumbents installed, so the comparison cannot pass vacuously', () => {
    expect(installed.length).toBeGreaterThanOrEqual(20);
  });

  it('lists exactly the installed incumbents whose require() returns a namespace', () => {
    const measured = installed.filter(([from]) => kind(required(from)) === 'namespace').map(([from]) => from);
    expect([...REQUIRE_NAMESPACE].sort()).toEqual(measured.sort());
  });

  it.each(installed)('require(%s) moves to %s exactly when both return the same kind', (from, to) => {
    const same = kind(required(from)) === kind(required(to));
    const { refused } = rewriteSource(`const x = require('${from}');\n`);
    expect(refused.length === 0, `${from} is ${kind(required(from))}, ${to} is ${kind(required(to))}`).toBe(same);
  });
});
