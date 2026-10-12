/**
 * `burgee migrate` moves a `require()` exactly when Node hands the two sides the same kind of
 * value (A29), and `REQUIRE_NAMESPACE` is measured rather than typed.
 *
 * Asked of Node's own `require()` for every installed incumbent in `MAPPING` and its target,
 * so a table that drifts from the packages goes red here. Before A29 every `require()` of an
 * ESM-only incumbent was refused — ten of them then, chalk 6 to exit-hook 5, and ansi-escapes 7 and terminal-link 5 once they were level — although their
 * `require()` already returned the namespace the target returns.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

import { SUPPORTED_MAJORS } from './compat.js';
import { MAPPING, packageOf, REQUIRE_NAMESPACE, rewriteSource } from './migrate.js';

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

/**
 * Whether the copy installed here is a major `migrate` rewrites. The root can hoist another
 * major of an incumbent for some unrelated dependency — `find-up` 5, a CommonJS function, where
 * the graded 8 is an ES module — and asking Node about that copy measures a package `migrate`
 * leaves alone (A12).
 */
function gradedMajor(specifier: string): boolean {
  const pkg = packageOf(specifier);
  try {
    const { version } = JSON.parse(readFileSync(new URL(`../../../node_modules/${pkg}/package.json`, import.meta.url), 'utf8')) as { version: string };
    return (SUPPORTED_MAJORS[pkg] ?? []).includes(Number(version.split('.')[0]));
  } catch {
    return false;
  }
}

const installed = Object.entries(MAPPING).filter(([from]) => required(from) !== undefined && gradedMajor(from));

describe('migrate reads require() shapes from Node, not from a guess (A29)', () => {
  it('finds the incumbents installed, so the comparison cannot pass vacuously', () => {
    expect(installed.length).toBeGreaterThanOrEqual(20);
  });

  it('lists exactly the installed incumbents whose require() returns a namespace', () => {
    const measured = installed.filter(([from]) => kind(required(from)) === 'namespace').map(([from]) => from);
    // Held over what this run can measure. A CI lane whose tree hoists another major of an
    // incumbent (or none) cannot say anything about that name, and reading its absence as "not a
    // namespace" failed the published-suites lanes on cli-truncate (#1007).
    const here = new Set(installed.map(([from]) => from));
    expect(REQUIRE_NAMESPACE.filter((name) => here.has(name)).sort()).toEqual(measured.sort());
  });

  it.each(installed)('require(%s) moves to %s exactly when both return the same kind', (from, to) => {
    const same = kind(required(from)) === kind(required(to));
    const { refused } = rewriteSource(`const x = require('${from}');\n`);
    expect(refused.length === 0, `${from} is ${kind(required(from))}, ${to} is ${kind(required(to))}`).toBe(same);
  });
});
