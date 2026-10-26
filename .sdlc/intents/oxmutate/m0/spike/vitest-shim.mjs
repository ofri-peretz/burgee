// The subset of `vitest` the subject's specs use (inventoried 2026-10-26): describe, it, expect,
// vi.fn, expectTypeOf, and toThrowErrorMatchingInlineSnapshot. Tests register once into a
// registry; the warm worker re-runs their callbacks per mutant without re-importing anything.
import * as chai from 'chai';
import { JestAsymmetricMatchers, JestChaiExpect, JestExtend } from '@vitest/expect';
import { fn, spyOn } from '@vitest/spy';

chai.use(JestExtend);
chai.use(JestChaiExpect);
chai.use(JestAsymmetricMatchers);
chai.use((c, utils) => {
  utils.addMethod(c.Assertion.prototype, 'toThrowErrorMatchingInlineSnapshot', function (snapshot) {
    const subject = utils.flag(this, 'object');
    let error;
    try {
      subject();
    } catch (e) {
      error = e;
    }
    if (error === undefined) throw new c.AssertionError('expected the function to throw');
    const got = `[${error.name}: ${error.message}]`;
    const want = String(snapshot ?? '').trim().replace(/^"(.*)"$/s, '$1');
    if (got !== want) throw new c.AssertionError(`inline snapshot mismatch: ${got} !== ${want}`);
  });
});

export const expect = (value, message) => chai.expect(value, message);
Object.assign(expect, chai.expect);

const registry = (globalThis.__spike__ ??= { tests: [], stack: [], file: undefined });

export function describe(name, body) {
  registry.stack.push(String(name));
  try {
    body();
  } finally {
    registry.stack.pop();
  }
}

export function it(name, body) {
  // During a spec re-import (fresh fixtures), tests land in `registry.sink` instead.
  (registry.sink ?? registry.tests).push({ file: registry.file, name: [...registry.stack, String(name)].join(' > '), body });
}

export const test = it;
for (const skipped of ['skip', 'todo']) {
  it[skipped] = () => {};
  describe[skipped] = () => {};
}

const unsupported = (what) => () => {
  throw new Error(`spike shim: ${what} is not supported`);
};
export const beforeEach = unsupported('beforeEach');
export const afterEach = unsupported('afterEach');
export const beforeAll = unsupported('beforeAll');
export const afterAll = unsupported('afterAll');

export const vi = { fn, spyOn };

// Type-level assertions are no-ops at runtime: any chain of property reads and calls succeeds.
const typeChain = new Proxy(function () {}, { get: () => typeChain, apply: () => typeChain });
export const expectTypeOf = () => typeChain;
export const assertType = () => {};
