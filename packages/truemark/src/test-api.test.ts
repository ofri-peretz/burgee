import { Linter, type Rule, type SourceCode } from 'eslint';
import type { CallExpression, MemberExpression, Node as EsNode } from 'estree';
import { describe, expect, it } from 'vitest';

import {
  binding,
  calleeChain,
  isTestApi,
  isTestFile,
  justification,
  memberName,
  TEST_MODULES,
  TEST_ROOTS,
  todayUtc,
  type CalleeChain,
} from './test-api.js';

/** Parse `code` and hand every call expression, with the source, to `visit`. */
function calls(code: string, visit: (node: CallExpression, sourceCode: SourceCode) => void): void {
  const probe: Rule.RuleModule = {
    create: (context) => ({
      CallExpression: (node: CallExpression) => visit(node, context.sourceCode),
    }),
  };
  const messages = new Linter().verify(code, {
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
    plugins: { t: { rules: { probe } } },
    rules: { 't/probe': 'error' },
  });
  expect(messages).toEqual([]);
}

/** The first call's callee in `code`. */
function firstCallee(code: string): EsNode {
  let callee: EsNode | undefined;
  calls(code, (node) => (callee ??= node.callee));
  return callee as EsNode;
}

function chain(code: string): (Pick<CalleeChain, 'path' | 'throughCall'> & { root: string }) | null {
  const found = calleeChain(firstCallee(code));
  return (
    found && {
      root: found.root.name,
      path: found.path,
      throughCall: found.throughCall,
    }
  );
}

/** The static name of the first call's callee in `code`. */
const name = (code: string): string | null => memberName(firstCallee(code) as MemberExpression);

/** What the root of the last call in `code` is bound to, and whether it is a test API. */
function last(code: string): [ReturnType<typeof binding>, boolean] {
  let result: [ReturnType<typeof binding>, boolean] | undefined;
  calls(code, (node, sourceCode) => {
    const found = calleeChain(node.callee);
    if (found) result = [binding(found.root, sourceCode), isTestApi(found.root, sourceCode)];
  });
  return result as [ReturnType<typeof binding>, boolean];
}

/** The justification of the first call in `code`, read with `today`. */
function why(code: string, today = '2026-11-23'): ReturnType<typeof justification> {
  let found: ReturnType<typeof justification> | undefined;
  calls(code, (node, sourceCode) => (found ??= justification(node, sourceCode, today)));
  return found as ReturnType<typeof justification>;
}

describe('the test-runner vocabulary', () => {
  it('names exactly these roots and modules', () => {
    expect([...TEST_ROOTS]).toEqual([
      'it',
      'test',
      'describe',
      'suite',
      'context',
      'bench',
      'xit',
      'xtest',
      'xdescribe',
      'xcontext',
      'fit',
      'ftest',
      'fdescribe',
    ]);
    expect([...TEST_MODULES]).toEqual(['vitest', '@jest/globals', '@playwright/test', 'node:test', 'bun:test', 'mocha']);
  });
});

describe('memberName', () => {
  it('reads a dotted name and a string key, and nothing else', () => {
    expect(name('a.b()')).toBe('b');
    expect(name("a['b']()")).toBe('b');
    expect(name('a[b]()')).toBeNull();
    expect(name('a[1]()')).toBeNull();
    expect(name('class A { #x() {} m() { this.#x(); } }')).toBeNull();
  });
});

describe('calleeChain', () => {
  it('reads a chain root first', () => {
    expect(chain('test.describe.only()')).toEqual({
      root: 'test',
      path: ['describe', 'only'],
      throughCall: false,
    });
    expect(chain('it()')).toEqual({ root: 'it', path: [], throughCall: false });
  });

  it('reads through a call: it.each(table)(name, fn)', () => {
    expect(chain("it.each([])('x', () => {})")).toEqual({
      root: 'it',
      path: ['each'],
      throughCall: true,
    });
    expect(chain("it.each([]).only('x')")).toEqual({
      root: 'it',
      path: ['each', 'only'],
      throughCall: true,
    });
  });

  it('refuses a computed key, a call it cannot read, and a root that is not a name', () => {
    expect(chain('it[name].only()')).toBeNull();
    expect(chain('it[name]()()')).toBeNull();
    expect(chain('(a || b).only()')).toBeNull();
  });
});

describe('binding and isTestApi', () => {
  it('reads an unbound test name as a global test API, and any other global as not', () => {
    expect(last("it('x')")).toEqual([{ kind: 'global' }, true]);
    expect(last('run()')).toEqual([{ kind: 'global' }, false]);
  });

  it('reads a local as not a test API', () => {
    expect(last("const it = () => {}; it('x')")).toEqual([{ kind: 'local' }, false]);
  });

  it('reads an import by the name it was imported under, from a test module only', () => {
    expect(last("import { test as it } from 'vitest'; it('x')")).toEqual([{ kind: 'import', module: 'vitest', name: 'test' }, true]);
    expect(last("import { it } from './iterators'; it('x')")).toEqual([{ kind: 'import', module: './iterators', name: 'it' }, false]);
    expect(last("import { expect as it } from 'vitest'; it('x')")[1]).toBe(false);
    expect(last("import test from '@playwright/test'; test('x')")).toEqual([
      { kind: 'import', module: '@playwright/test', name: 'default' },
      true,
    ]);
    expect(last("import { 'it' as t } from 'vitest'; t('x')")).toEqual([{ kind: 'import', module: 'vitest', name: 'it' }, true]);
  });
});

describe('isTestFile', () => {
  it('reads test, spec, e2e and bench files, and test directories', () => {
    for (const file of [
      'a.test.ts',
      'a.spec.jsx',
      'a.e2e.mts',
      'a.bench.cjs',
      'a.test.tsx',
      'src/__tests__/a.ts',
      'tests/a.ts',
      'test/a.ts',
      'pkg/e2e/a.ts',
      'spec/a.ts',
      'specs/a.ts',
      'src\\tests\\a.ts',
    ]) {
      expect(isTestFile(file), file).toBe(true);
    }
  });

  it('does not read a file that only looks like one', () => {
    for (const file of ['a.test.ts.orig', 'a.ts', 'contest/a.ts', 'latest/a.ts', 'src/testsuite.ts', 'a.test.py', 'tests.ts']) {
      expect(isTestFile(file), file).toBe(false);
    }
  });
});

describe('justification', () => {
  it('reads an issue or pull-request URL, http or https, in any case', () => {
    expect(why("// https://github.com/o/r/issues/12\nit('x')")).toEqual({
      kind: 'issue',
    });
    expect(why("it('x') // HTTP://jira.example.com/browse/ABC-1")).toEqual({
      kind: 'issue',
    });
    expect(why("// https://github.com/o/r/issues/\nit('x')")).toEqual({
      kind: 'none',
    });
  });

  it('reads a decision id, whole', () => {
    expect(why("// D-107\nit('x')")).toEqual({ kind: 'decision' });
    expect(why("// D-20261123-slug\nit('x')")).toEqual({ kind: 'decision' });
    expect(why("// AD-107\nit('x')")).toEqual({ kind: 'none' });
    expect(why("// D-x\nit('x')")).toEqual({ kind: 'none' });
  });

  it('reads a date, in force on the day itself and expired the day after', () => {
    expect(why("// until 2026-11-23\nit('x')")).toEqual({
      kind: 'until',
      date: '2026-11-23',
      expired: false,
    });
    expect(why("// until 2026-11-22\nit('x')")).toEqual({
      kind: 'until',
      date: '2026-11-22',
      expired: true,
    });
  });

  it('reads only the line of the node and the line above it', () => {
    expect(why("// D-107\n\nit('x')")).toEqual({ kind: 'none' });
    expect(why("it('x')\n// D-107")).toEqual({ kind: 'none' });
    expect(why("it('x')")).toEqual({ kind: 'none' });
  });
});

describe('todayUtc', () => {
  it('is a bare YYYY-MM-DD', () => {
    expect(todayUtc()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
