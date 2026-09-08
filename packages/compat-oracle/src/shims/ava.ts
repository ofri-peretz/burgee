/**
 * `ava` for a vendored suite, over `node:test`. The output-stack incumbents (chalk, ora,
 * boxen, log-update) write their tests for ava; vendoring them unedited means giving them
 * ava's `test(name, t => …)` with the assertions they use, backed by `node:assert`, so
 * the oracle's one TAP parser reads every host. Only what the suites call is here; an
 * assertion they do not use is a name that does not exist.
 */
import assert from 'node:assert/strict';
import { test as nodeTest } from 'node:test';

export interface ExecutionContext {
  is: (actual: unknown, expected: unknown, message?: string) => void;
  not: (actual: unknown, expected: unknown, message?: string) => void;
  deepEqual: (actual: unknown, expected: unknown, message?: string) => void;
  notDeepEqual: (actual: unknown, expected: unknown, message?: string) => void;
  true: (value: unknown, message?: string) => void;
  false: (value: unknown, message?: string) => void;
  truthy: (value: unknown, message?: string) => void;
  falsy: (value: unknown, message?: string) => void;
  regex: (value: string, pattern: RegExp, message?: string) => void;
  notRegex: (value: string, pattern: RegExp, message?: string) => void;
  throws: (fn: () => unknown, expectation?: { message?: string | RegExp; instanceOf?: new (...args: never[]) => unknown } | null, message?: string) => unknown;
  throwsAsync: (fn: () => Promise<unknown>, expectation?: { message?: string | RegExp } | null, message?: string) => Promise<unknown>;
  notThrows: (fn: () => unknown, message?: string) => void;
  notThrowsAsync: (fn: () => Promise<unknown>, message?: string) => Promise<void>;
  pass: (message?: string) => void;
  fail: (message?: string) => never;
  plan: (count: number) => void;
  teardown: (fn: () => void | Promise<void>) => void;
  log: (...values: unknown[]) => void;
  timeout: (ms: number) => void;
  title: string;
}

type Implementation = (t: ExecutionContext) => void | Promise<void>;

const matches = (error: unknown, expectation: { message?: string | RegExp; instanceOf?: new (...args: never[]) => unknown } | null | undefined): boolean => {
  if (expectation === null || expectation === undefined) return true;
  const message = error instanceof Error ? error.message : String(error);
  if (expectation.instanceOf !== undefined && !(error instanceof expectation.instanceOf)) return false;
  if (typeof expectation.message === 'string') return message === expectation.message;
  if (expectation.message instanceof RegExp) return expectation.message.test(message);
  return true;
};

/**
 * node:assert's typings take a message or nothing, never `undefined`, and ava's callers pass
 * either; each assertion branches so the generated diff survives when no message was given.
 */
type Pair = (actual: unknown, expected: unknown, message: string) => void;
type PairBare = (actual: unknown, expected: unknown) => void;
const pair =
  (withMessage: Pair, bare: PairBare) =>
  (a: unknown, b: unknown, m?: string): void => {
    if (m === undefined) bare(a, b);
    else withMessage(a, b, m);
  };

function context(title: string, teardowns: (() => void | Promise<void>)[]): ExecutionContext {
  const is = pair((a, b, m) => assert.strictEqual(a, b, m), (a, b) => assert.strictEqual(a, b));
  return {
    title,
    is,
    not: pair((a, b, m) => assert.notStrictEqual(a, b, m), (a, b) => assert.notStrictEqual(a, b)),
    deepEqual: pair((a, b, m) => assert.deepStrictEqual(a, b, m), (a, b) => assert.deepStrictEqual(a, b)),
    notDeepEqual: pair((a, b, m) => assert.notDeepStrictEqual(a, b, m), (a, b) => assert.notDeepStrictEqual(a, b)),
    true: (v, m) => is(v, true, m),
    false: (v, m) => is(v, false, m),
    truthy: (v, m) => (m === undefined ? assert.ok(v) : assert.ok(v, m)),
    falsy: (v, m) => (m === undefined ? assert.ok(!v) : assert.ok(!v, m)),
    regex: (v, p, m) => (m === undefined ? assert.match(v, p) : assert.match(v, p, m)),
    notRegex: (v, p, m) => (m === undefined ? assert.doesNotMatch(v, p) : assert.doesNotMatch(v, p, m)),
    throws: (fn, expectation, m) => {
      let thrown: unknown;
      let did = false;
      try {
        fn();
      } catch (error) {
        did = true;
        thrown = error;
      }
      assert.ok(did, m ?? 'expected the function to throw');
      assert.ok(matches(thrown, expectation), m ?? `thrown error did not match: ${thrown instanceof Error ? thrown.message : String(thrown)}`);
      return thrown;
    },
    throwsAsync: async (fn, expectation, m) => {
      let thrown: unknown;
      let did = false;
      try {
        await fn();
      } catch (error) {
        did = true;
        thrown = error;
      }
      assert.ok(did, m ?? 'expected the promise to reject');
      assert.ok(matches(thrown, expectation), m ?? 'rejection did not match');
      return thrown;
    },
    notThrows: (fn, m) => (m === undefined ? assert.doesNotThrow(fn) : assert.doesNotThrow(fn, m)),
    notThrowsAsync: async (fn, m) => {
      if (m === undefined) await assert.doesNotReject(fn);
      else await assert.doesNotReject(fn, m);
    },
    pass: () => undefined,
    fail: (m) => assert.fail(m ?? 'test failed'),
    plan: () => undefined,
    teardown: (fn) => void teardowns.push(fn),
    log: () => undefined,
    timeout: () => undefined,
  };
}

async function run(title: string, implementation: Implementation): Promise<void> {
  const teardowns: (() => void | Promise<void>)[] = [];
  try {
    await implementation(context(title, teardowns));
  } finally {
    await teardowns.reverse().reduce<Promise<void>>((p, fn) => p.then(fn), Promise.resolve());
  }
}

interface TestFn {
  (title: string, implementation: Implementation): void;
  serial: TestFn;
  skip: (title: string, implementation?: Implementation) => void;
  only: (title: string, implementation: Implementation) => void;
  failing: (title: string, implementation: Implementation) => void;
  before: (fn: () => void | Promise<void>) => void;
  after: (fn: () => void | Promise<void>) => void;
  beforeEach: (fn: () => void | Promise<void>) => void;
  afterEach: (fn: () => void | Promise<void>) => void;
}

const test = ((title: string, implementation: Implementation): void => {
  void nodeTest(title, () => run(title, implementation));
}) as TestFn;

test.serial = test;
test.skip = (title) => void nodeTest(title, { skip: true }, () => undefined);
test.only = (title, implementation) => void nodeTest(title, { only: true }, () => run(title, implementation));
test.failing = (title, implementation) => void nodeTest(title, async () => {
  await assert.rejects(run(title, implementation));
});
test.before = (fn) => void nodeTest('before', fn);
test.after = (fn) => void nodeTest('after', fn);
test.beforeEach = () => undefined;
test.afterEach = () => undefined;

export default test;
