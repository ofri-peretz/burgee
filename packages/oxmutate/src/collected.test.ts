import { describe, expect, it } from 'vitest';

import { type AroundHooks, type CollectedTask, unmodeled } from './collected.js';

/** A registered handler or hook; what it does is never read. */
const handler = (): undefined => undefined;
const none: AroundHooks = () => ({ aroundEach: [], aroundAll: [] });
const test = (fields: Partial<CollectedTask> = {}): CollectedTask => ({ type: 'test', ...fields });
/** A file holding a suite holding the test: the check walks both levels. */
const fileWith = (t: CollectedTask): CollectedTask => ({ type: 'suite', tasks: [test(), { type: 'suite', tasks: [t] }] });

describe('unmodeled: what the live runner does not run as Vitest does sends the file to a fresh worker', () => {
  it('passes a plain file, Vitest 4.1 shapes included (no around-hooks, retry 0, no handlers)', () => {
    expect(unmodeled(fileWith(test({ retry: 0, repeats: 0, fails: false, concurrent: false, onFinished: [], onFailed: [], result: { pending: false } })), none)).toBeUndefined();
    expect(unmodeled(fileWith(test()), () => ({}))).toBeUndefined();
    expect(unmodeled({ type: 'suite' }, none)).toBeUndefined();
    // A file whose import threw under the mutant has no hooks at all: still nothing refused, nothing thrown.
    expect(unmodeled(fileWith(test()), () => undefined)).toBeUndefined();
  });

  it.each<[string, Partial<CollectedTask>, string]>([
    ['test.fails, whose result Vitest inverts', { fails: true }, 'a test is marked `fails`'],
    ['a retry count', { retry: 1 }, 'a test is retried'],
    ["Vitest 5's retry object", { retry: { count: 2 } }, 'a test is retried'],
    ['repeats', { repeats: 1 }, 'a test is repeated'],
    ['a concurrent test', { concurrent: true }, 'a test runs concurrently'],
    ['an onTestFinished handler left after the run', { onFinished: [handler] }, 'a test registered onTestFinished/onTestFailed'],
    ['an onTestFailed handler left after the run', { onFailed: [handler] }, 'a test registered onTestFinished/onTestFailed'],
    ['context.skip()', { result: { pending: true } }, 'a test skipped itself'],
  ])('refuses %s, nested in a suite', (_, fields, reason) => {
    expect(unmodeled(fileWith(test(fields)), none)).toBe(reason);
  });

  it('reads a retry object without a count as no retry', () => {
    expect(unmodeled(fileWith(test({ retry: {} })), none)).toBeUndefined();
  });

  it.each([
    ['aroundEach', { aroundEach: [handler] }],
    ['aroundAll', { aroundAll: [handler] }],
  ])('refuses a suite with %s hooks, at any depth', (_, hooks) => {
    const inner: CollectedTask = { type: 'suite', tasks: [test()] };
    const file: CollectedTask = { type: 'suite', tasks: [inner] };
    expect(unmodeled(file, (s) => (s === inner ? hooks : {}))).toBe('a suite has aroundEach/aroundAll hooks');
  });

  it('checks every task, not only the first', () => {
    const file: CollectedTask = { type: 'suite', tasks: [test(), test(), test({ fails: true })] };
    expect(unmodeled(file, none)).toBe('a test is marked `fails`');
  });
});
