import { describe, expect, expectTypeOf, it } from 'vitest';

import { array, check, issues, number, object, optional, parse, refineAsync, type Schema, string, transform, transformAsync } from './index.js';
import { standard, standardAsync, type StandardResult, VENDOR } from './standard.js';

/**
 * Wave 3: Standard Schema. The cases are the ones the competitors' probes hold zod, valibot and
 * arktype to (benchmarks/results/validator/parity-2026-11-13), and the specification's own
 * interface, read from the copy zod 4.6.7 ships.
 */

const lengthOf = (text: string): number => text.length;
const lengthLater = (text: string): Promise<number> => Promise.resolve(text.length);
const isOk = (text: string): Promise<boolean> => Promise.resolve(text === 'ok');

describe('standard', () => {
  it('io.standard_schema: the schema has `~standard` with version 1, a vendor and a validate that works', () => {
    const props = standard(string())['~standard'];
    expect(props.version).toBe(1);
    expect(props.vendor).toBe(VENDOR);
    expect(props.validate('a')).toEqual({ value: 'a' });
    const refused = props.validate(1);
    expect(refused.issues).toHaveLength(1);
    expect(refused).toEqual({ issues: [{ message: 'expected a string, got number 1. fix: send a string', path: [] }] });
  });

  it('names the vendor in one constant', () => {
    expect(VENDOR).toBe('validator');
    expect(standardAsync(string())['~standard'].vendor).toBe(VENDOR);
  });

  it('gives each issue its path as an array, an index into an array as a number', () => {
    const Rows = standard(object({ rows: array(object({ 'a/b': string(), n: number() })) }));
    expect(Rows['~standard'].validate({ rows: [{ 'a/b': 'x', n: 1 }, { 'a/b': 1, n: 'x' }] })).toEqual({
      issues: [
        { message: 'expected a string, got number 1. fix: send a string', path: ['rows', 1, 'a/b'] },
        { message: 'expected a number, got string "x". fix: send a finite number', path: ['rows', 1, 'n'] },
      ],
    });
  });

  it('validates with one call of parse: a default is filled and a map is run, once', () => {
    const seen: string[] = [];
    const Sized = standard(
      object({
        d: optional(string(), { default: 'x' }),
        n: transform(string(), (text) => {
          seen.push(text);
          return text.length;
        }),
      }),
    );
    expect(Sized['~standard'].validate({ n: 'abc' })).toEqual({ value: { d: 'x', n: 3 } });
    expect(seen).toEqual(['abc']);
  });

  it('is still a schema of this library, frozen, with the one member more', () => {
    const plain = string({ min: 1 });
    const made = standard(plain);
    expect(Object.isFrozen(made)).toBe(true);
    expect(Object.isFrozen(made['~standard'])).toBe(true);
    expect(Object.keys(made)).toEqual([...Object.keys(plain), '~standard']);
    expect(Object.keys(made['~standard'])).toEqual(['version', 'vendor', 'validate']);
    expect([check(made, 'a'), check(made, ''), issues(made, '').length, parse(object({ a: made }), { a: 'a' }).ok]).toEqual([true, false, 1, true]);
    expect('~standard' in plain).toBe(false);
  });

  it('carries the input and the output type for a library to infer, and no value for them', () => {
    const Sized = standard(object({ n: transform(string(), lengthOf) }));
    type Types = NonNullable<(typeof Sized)['~standard']['types']>;
    expectTypeOf<Types['input']>().toEqualTypeOf<{ n: string }>();
    expectTypeOf<Types['output']>().toEqualTypeOf<{ n: number }>();
    expectTypeOf(Sized['~standard'].validate).returns.toEqualTypeOf<StandardResult<{ n: number }>>();
    expectTypeOf(Sized).toMatchTypeOf<Schema<{ n: string }, { n: number }>>();
    expect(Sized['~standard'].types).toBeUndefined();
  });

  it('answers at once, so a schema with a rule or a map to await is refused, with what to do', () => {
    expect(() => standard(transformAsync(string(), lengthLater))['~standard'].validate('a')).toThrow('fix: call `parseAsync`');
  });
});

describe('standardAsync', () => {
  it('validates with one call of parseAsync, and answers with a promise', async () => {
    const seen: string[] = [];
    const Sized = standardAsync(
      object({
        id: refineAsync(string(), isOk),
        n: transformAsync(string(), (text) => {
          seen.push(text);
          return lengthLater(text);
        }),
      }),
    );
    const answer = Sized['~standard'].validate({ id: 'ok', n: 'abc' });
    expect(answer).toBeInstanceOf(Promise);
    expect(await answer).toEqual({ value: { id: 'ok', n: 3 } });
    expect(seen).toEqual(['abc']);
    expect(await Sized['~standard'].validate({ id: 'no', n: 'abc' })).toEqual({
      issues: [{ message: 'expected a value the rule accepts, got string "no". fix: change the value so that the rule holds', path: ['id'] }],
    });
    expect(await Sized['~standard'].validate([{ id: 1 }])).toEqual({ issues: [{ message: 'expected an object, got an array. fix: send an object', path: [] }] });
    expectTypeOf(Sized['~standard'].validate).returns.toEqualTypeOf<Promise<StandardResult<{ id: string; n: number }>>>();
    expect(Object.isFrozen(Sized)).toBe(true);
  });

  it.each([[{ a: ['x'] }], [{ a: ['x', 1] }], [null]])('gives what standard gives for a schema with nothing to await, on %j', async (input) => {
    const Plain = object({ a: array(string()) });
    expect(await standardAsync(Plain)['~standard'].validate(input)).toEqual(standard(Plain)['~standard'].validate(input));
  });
});
