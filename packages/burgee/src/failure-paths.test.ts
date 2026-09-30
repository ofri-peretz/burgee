/**
 * What a failed run says for the throws the other failure suites do not make: a refusal
 * object naming its code by string, an action required with no `next` and no hint, a parse
 * failure with no command to suggest from, and a façade handler rejecting with nothing at all.
 */
import { describe, expect, it } from 'vitest';

import { defineCommand, defineProgram, runCommand } from './execute.js';
import { ExitCode } from './exit-code.js';
import { handlerFailure } from './facade-failure.js';
import { describeFailure } from './failure.js';

const throwing = (value: unknown): ReturnType<typeof defineProgram> =>
  defineProgram({
    name: 'app',
    commands: [
      defineCommand({
        name: 'go',
        effects: 'read_only',
        run: () => {
          throw value;
        },
      }),
    ],
  });

describe('a refusal object that names its code by string (P2, D-120)', () => {
  it('leaves with that code and says its own message, hint and fix', async () => {
    const r = await runCommand(throwing({ code: 'USAGE', message: 'pick one', hint: 'try --a', fix: '--a' }), ['go']);
    expect(r).toEqual({ code: ExitCode.USAGE, stdout: '', stderr: 'error: pick one\nhint: try --a\nfix: --a\n' });
  });
  it('carries no hint or fix it was not given, and reads a message that is not a string as the value', async () => {
    const r = await runCommand(throwing({ code: 'AUTH', message: 42, hint: 7 }), ['go']);
    expect(r.code).toBe(ExitCode.AUTH);
    expect(r.stderr).toBe('error: [object Object]\n');
  });
});

describe('an action required with nothing to run next (N11)', () => {
  const program = defineProgram({
    name: 'app',
    commands: [defineCommand({ name: 'login', effects: 'read_only', run: ({ actionRequired }) => actionRequired({ reason: 'login', message: 'sign in first' }) })],
  });
  it('as text: the reason and message, with no next: block and no hint line', async () => {
    const r = await runCommand(program, ['login']);
    expect(r).toEqual({ code: ExitCode.CANCELLED, stdout: '', stderr: 'action required (login): sign in first\n' });
  });
  it('carries no hint key at all, rather than one set to undefined', async () => {
    const spec = { reason: 'login', message: 'sign in first' };
    expect(await describeFailure(new Error('sign in first'), [], undefined, spec)).toStrictEqual({ code: ExitCode.CANCELLED, message: 'sign in first', action: spec });
  });
  it('as JSON: an empty next[] and no hint', async () => {
    const r = await runCommand(program, ['login', '--json']);
    expect(JSON.parse(r.stdout)).toEqual({ ok: false, status: 'action_required', reason: 'login', message: 'sign in first', next: [], error: { code: ExitCode.CANCELLED, message: 'sign in first' } });
  });
});

describe('a parse failure with no command to suggest from', () => {
  it('is USAGE, and points at --help', async () => {
    const cause = Object.assign(new TypeError("Unknown option '--nope'. To specify a positional argument starting with a '-', place it at the end of the command after '--', as in '-- \"--nope\"'"), { code: 'ERR_PARSE_ARGS_UNKNOWN_OPTION' });
    expect(await describeFailure(cause, ['--nope'], undefined, undefined)).toEqual({
      code: ExitCode.USAGE,
      message: 'unknown option --nope',
      hint: 'run --help to see the available options',
    });
  });
});

describe('a façade handler that fails with no value (D-140)', () => {
  it('reports null and undefined as runtime failures, named as themselves', () => {
    expect(handlerFailure(null)).toEqual({ exit: ExitCode.RUNTIME, error: { code: 'runtime', message: 'null' } });
    expect(handlerFailure(undefined)).toEqual({ exit: ExitCode.RUNTIME, error: { code: 'runtime', message: 'undefined' } });
  });
});
