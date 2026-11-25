/**
 * Run-time validation (`validate.ts`) read as the caller reads it: each refusal's message and the
 * hint beside it, and the bounds a value may sit exactly on.
 */
import { describe, expect, it } from 'vitest';

import { type OptionSpec } from './manifest.js';
import { coerce, toNumber } from './validate.js';

/** What `fn` refused with, as message and hint. */
async function refused(fn: () => unknown): Promise<{ message: string; hint: string | undefined }> {
  try {
    await fn();
  } catch (error) {
    const { message, hint } = error as { message: string; hint?: string };
    return { message, hint };
  }
  throw new Error('nothing was refused');
}

const num = (spec: Partial<OptionSpec> = {}): OptionSpec => ({ type: 'number', ...spec }) as OptionSpec;

describe('toNumber', () => {
  it('hands a number through as it is, -0 included', () => {
    expect(Object.is(toNumber('n', num(), -0), -0)).toBe(true);
  });

  it('says what to pass for a word, a fraction, and a value out of bounds', async () => {
    expect(await refused(() => toNumber('maxCount', num(), 'many'))).toEqual({ message: '--max-count expects a number, got "many"', hint: 'pass --max-count <number>' });
    expect(await refused(() => toNumber('n', num({ integer: true }), '2.6'))).toEqual({ message: '--n expects an integer, got 2.6', hint: 'pass --n 3' });
    expect(await refused(() => toNumber('n', num({ minimum: 2 }), '1'))).toEqual({ message: '--n must be at least 2, got 1', hint: 'pass --n 2' });
    expect(await refused(() => toNumber('n', num({ maximum: 9 }), '10'))).toEqual({ message: '--n must be at most 9, got 10', hint: 'pass --n 9' });
  });

  it('takes a value inside its bounds, and on either one', () => {
    const spec = num({ minimum: 2, maximum: 9 });
    expect([toNumber('n', spec, '2'), toNumber('n', spec, '5'), toNumber('n', spec, '9')]).toEqual([2, 5, 9]);
  });
});

describe('coerce', () => {
  it('hints the first choice', async () => {
    const specs = { mode: { type: 'string', choices: ['fast', 'slow'] } } as Record<string, OptionSpec>;
    expect(await refused(() => coerce(specs, { mode: 'medium' }))).toEqual({ message: '--mode must be one of fast, slow, got "medium"', hint: 'pass --mode fast' });
  });

  it("joins a schema's issues with semicolons, and hints the flag to check", async () => {
    const schema = { '~standard': { version: 1, vendor: 'test', validate: () => ({ issues: [{ message: 'too short' }, { message: 'no digit' }] }) } };
    const specs = { password: { type: 'string', schema } } as unknown as Record<string, OptionSpec>;
    expect(await refused(() => coerce(specs, { password: 'x' }))).toEqual({ message: '--password: too short; no digit', hint: 'check --password' });
  });
});
