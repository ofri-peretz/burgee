import { describe, expect, it } from 'vitest';

import { agrees, type DryResult, entriesOf, keepable, merge } from './dry-reuse.js';

const test = (id: string, file: string, state = 'pass') => ({ id, file, name: id, ms: 1, state });
const dry = (over: Partial<DryResult> = {}): DryResult => ({
  tests: [test('a1', '/a.spec.ts'), test('b1', '/b.spec.ts')],
  perTest: { a1: { m1: 2 }, b1: { m2: 1 }, 'file:/a.spec.ts': { s1: 1 } },
  static: {},
  runOnce: ['/b.spec.ts'],
  modules: { '/a.spec.ts': ['/a.ts'], '/b.spec.ts': ['/b.ts'] },
  reads: { static: {}, perTest: { a1: { r: 1 } } },
  ...over,
});
const keyOf = (file: string, modules: readonly string[]): string => `${file}<${modules.join(',')}`;
/** b.spec.ts's key no longer holds. */
const changed = (file: string, modules: readonly string[]): string => (file === '/b.spec.ts' ? 'new' : keyOf(file, modules));

describe('keeping a dry run per test file', () => {
  it('splits a run into one entry per test file, each with its own tests, coverage and graph', () => {
    const cache = entriesOf(dry(), keyOf, new Set(['b1']), dry().reads.perTest);
    expect(cache.static).toBe(false);
    expect(cache.files['/a.spec.ts']).toEqual({ key: '/a.spec.ts</a.ts', tests: [test('a1', '/a.spec.ts')], perTest: { a1: { m1: 2 }, 'file:/a.spec.ts': { s1: 1 } }, modules: ['/a.ts'], runOnce: false, flaky: [], reads: { a1: { r: 1 } } });
    expect(cache.files['/b.spec.ts']).toMatchObject({ runOnce: true, flaky: ['b1'], perTest: { b1: { m2: 1 } }, reads: {} });
    expect('reads' in (entriesOf(dry(), keyOf, new Set(), undefined).files['/a.spec.ts'] ?? {})).toBe(false);
  });

  it('keeps nothing from a run with hits no file owns', () => {
    expect(entriesOf(dry({ static: { m9: 1 } }), keyOf, new Set(), undefined)).toEqual({ static: true, files: {} });
    expect(keepable({ static: true, files: entriesOf(dry(), keyOf, new Set(), undefined).files }, keyOf, () => false)).toEqual({ kept: {}, audited: {} });
    expect(keepable(undefined, keyOf, () => false)).toEqual({ kept: {}, audited: {} });
  });

  it('keeps a file only while its key holds, and runs the ones the audit picks', () => {
    const stored = entriesOf(dry(), keyOf, new Set(), undefined);
    expect(Object.keys(keepable(stored, changed, () => false).kept)).toEqual(['/a.spec.ts']);
    const picks = [true, false];
    const { kept, audited } = keepable(stored, keyOf, () => picks.shift() ?? false);
    expect([Object.keys(kept), Object.keys(audited)]).toEqual([['/b.spec.ts'], ['/a.spec.ts']]);
  });

  it('keeps a stored file named __proto__ as a key, never as a prototype', () => {
    const files = JSON.parse('{"__proto__": {"key": "__proto__<", "tests": [], "perTest": {}, "modules": [], "runOnce": false, "flaky": []}}') as Record<string, never>;
    const { kept } = keepable({ static: false, files }, keyOf, () => false);
    expect(Object.getPrototypeOf(kept)).toBe(Object.prototype);
    expect(Object.keys(kept)).toEqual(['__proto__']);
  });

  it('merges kept files into a fresh run as one run over all of them', () => {
    const kept = entriesOf(dry(), keyOf, new Set(), dry().reads.perTest).files;
    const only = (file: string) => ({ [file]: kept[file]! });
    const fresh = dry({ tests: [test('a1', '/a.spec.ts')], perTest: { a1: { m1: 5 } }, runOnce: [], modules: { '/a.spec.ts': ['/a.ts'] }, reads: { static: { x: 1 }, perTest: {} } });
    expect(merge(fresh, only('/b.spec.ts'))).toEqual({
      tests: [test('a1', '/a.spec.ts'), test('b1', '/b.spec.ts')],
      perTest: { a1: { m1: 5 }, b1: { m2: 1 } },
      static: {},
      runOnce: ['/b.spec.ts'],
      modules: { '/a.spec.ts': ['/a.ts'], '/b.spec.ts': ['/b.ts'] },
      reads: { static: { x: 1 }, perTest: {} },
    });
    expect(merge(fresh, {})).toEqual(fresh);
  });

  it('believes a kept file when a fresh run of it reaches the same mutants from the same tests', () => {
    const entry = entriesOf(dry(), keyOf, new Set(), undefined).files['/a.spec.ts']!;
    expect(agrees(dry({ perTest: { a1: { m1: 9 }, 'file:/a.spec.ts': { s1: 3 } } }), '/a.spec.ts', entry)).toBe(true);
    expect(agrees(dry({ perTest: { a1: {}, 'file:/a.spec.ts': { s1: 1 } } }), '/a.spec.ts', entry)).toBe(false);
    expect(agrees(dry({ perTest: { a1: { m1: 2 } } }), '/a.spec.ts', entry)).toBe(false);
    expect(agrees(dry({ tests: [test('a1', '/a.spec.ts', 'fail')] }), '/a.spec.ts', entry)).toBe(false);
    expect(agrees(dry({ tests: [test('a1', '/a.spec.ts'), test('a2', '/a.spec.ts')] }), '/a.spec.ts', entry)).toBe(false);
  });
});
