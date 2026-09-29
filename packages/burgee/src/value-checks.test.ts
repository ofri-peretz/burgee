/**
 * Values at the edges of the checks S3, S6 and S8 describe: a number given as an empty string,
 * a choice list that is empty, a repeatable option whose config list holds a non-string, and
 * the one relation no other suite declares — `atLeastOneOf`.
 */
import { describe, expect, it } from 'vitest';

import { defineCommand, defineProgram, runCommand } from './execute.js';
import { ExitCode } from './exit-code.js';
import { coerce, splitMultiple, toNumber } from './validate.js';

describe('a number that is not one', () => {
  it('reads an empty or blank string as no number, not as zero', () => {
    expect(() => toNumber('count', { type: 'number' }, '')).toThrow('--count expects a number, got ""');
    expect(() => toNumber('count', { type: 'number' }, '   ')).toThrow('--count expects a number, got "   "');
    expect(toNumber('count', { type: 'number' }, ' 7 ')).toBe(7);
  });
});

describe('an empty choice list', () => {
  it('refuses every value, and suggests no value rather than "undefined"', async () => {
    await expect(coerce({ mode: { type: 'string', choices: [] } }, { mode: 'fast' })).rejects.toMatchObject({ message: '--mode must be one of , got "fast"', hint: 'pass --mode ' });
  });
});

describe('a repeatable option’s values from config', () => {
  it('splits strings on the separator and keeps anything else whole', () => {
    expect(splitMultiple({ type: 'string', multiple: true }, ['a, b', 3, 'c'])).toEqual(['a', 'b', 3, 'c']);
  });
});

describe('atLeastOneOf (S2)', () => {
  const program = defineProgram({
    name: 'app',
    commands: [
      defineCommand({
        name: 'notify',
        effects: 'read_only',
        options: { email: { type: 'string' }, sms: { type: 'string' } },
        relations: [{ atLeastOneOf: ['email', 'sms'] }],
        run: ({ options }) => Object.keys(options).filter((k) => options[k as keyof typeof options] !== undefined).join(','),
      }),
    ],
  });
  it('refuses a run that sets none, naming them all', async () => {
    const r = await runCommand(program, ['notify']);
    expect(r).toEqual({ code: ExitCode.USAGE, stdout: '', stderr: 'error: at least one of --email, --sms is required\nhint: pass one of them\n' });
  });
  it('runs with one, or with both', async () => {
    expect((await runCommand(program, ['notify', '--sms', '1'])).stdout).toBe('sms\n');
    expect((await runCommand(program, ['notify', '--sms', '1', '--email', 'a@b'])).stdout).toBe('email,sms\n');
  });
});
