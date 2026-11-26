/**
 * `describeFailure` and `reportFailure` on the throws the run-level suites never make: a refusal
 * naming CONFIG or CANCELLED by string, an exit signal and an `Again` (which nothing prints), a
 * thrown `null`, a plugin's refusal, a parse failure that is not about an unknown option, and an
 * action whose next steps run under a two-word program.
 */
import { describe, expect, it } from 'vitest';

import { ExitCode } from './exit-code.js';
import { describeFailure, reportFailure } from './failure.js';
import { type Manifest } from './manifest.js';
import { PluginError } from './plugin.js';
import { Again, singleDashHint, unknownOption } from './unknown-option.js';

const at = { manifest: { rootPath: ['app'] }, argv: ['go'] };
const runnable = { run: () => undefined, options: {} } as unknown as Parameters<typeof describeFailure>[2];

describe('describeFailure, on the throws a run never prints', () => {
  it('reads CONFIG and CANCELLED as codes a refusal may name by string', async () => {
    expect((await describeFailure({ code: 'CONFIG', message: 'm' }, at, undefined, undefined)).code).toBe(ExitCode.CONFIG);
    expect((await describeFailure({ code: 'CANCELLED', message: 'm' }, at, undefined, undefined)).code).toBe(ExitCode.CANCELLED);
  });

  it('leaves an exit signal silent, with no message and no usage, even on a command that runs', async () => {
    expect(await describeFailure({ code: ExitCode.USAGE }, at, runnable, undefined)).toStrictEqual({ code: ExitCode.USAGE, kind: 'usage', message: '', silent: true });
  });

  it('hands back the line to run instead, without the program, and says nothing', async () => {
    expect(await describeFailure(new Again(['app', 'go', '--json']), at, undefined, undefined)).toStrictEqual({ code: ExitCode.USAGE, kind: 'usage', message: '', again: ['go', '--json'] });
  });

  it('reports a thrown null as itself', async () => {
    expect(await describeFailure(null, at, undefined, undefined)).toStrictEqual({ code: ExitCode.RUNTIME, kind: 'runtime', message: 'null' });
  });

  it('leads a plugin refusal with its code, and makes its fix the hint', async () => {
    const failure = await describeFailure(new PluginError('E_PLUGIN_SCHEMA', 'bad plugin', 'fix it'), at, undefined, undefined);
    expect(failure).toMatchObject({ code: ExitCode.CONFIG, message: 'E_PLUGIN_SCHEMA bad plugin', hint: 'fix it' });
  });

  it('points a parse failure that is not about an unknown option at --help', async () => {
    const cause = Object.assign(new TypeError("Option '--name <value>' argument missing"), { code: 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE' });
    expect(await describeFailure(cause, at, undefined, undefined)).toMatchObject({ code: ExitCode.USAGE, hint: 'run --help to see the available options' });
  });

  it('builds a runtime failure’s fix from the line as typed, the words it omits left out', async () => {
    const cause = Object.assign(new Error('x'), { omit: [1] });
    expect((await describeFailure(cause, { manifest: { rootPath: ['app'] }, argv: ['go', 'extra'] }, undefined, undefined)).fix).toBe('app go');
  });
});

describe('reportFailure, an action’s next steps', () => {
  it('names the whole program in front of each, one line apiece', async () => {
    const manifest = { rootPath: ['my', 'app'], plugins: [] } as unknown as Manifest;
    let err = '';
    const io = { out: { write: () => true }, err: { write: (s: string) => (err += s), isTTY: true }, env: {} };
    const action = { reason: 'login', message: 'sign in', next: [{ command: 'login', when: 'first' }, { command: 'retry', when: 'then' }] };
    await reportFailure({ code: ExitCode.CANCELLED, message: 'sign in', action }, manifest, false, io);
    expect(err).toBe('action required (login): sign in\nnext:\n  my app login    first\n  my app retry    then\n');
  });
});

describe('the unknown-option words', () => {
  it('reads only a message that starts with parseArgs’ own words', () => {
    expect(unknownOption(new Error("not: Unknown option '--a'"), ['a'], ['--a'])).toBeUndefined();
  });

  it('reads a single-dash word only when the whole token is one', () => {
    expect(singleDashHint(['-foo.bar'])).toBeUndefined();
  });

  it('keeps --format text a refusal when a declared option is near --format', () => {
    const cause = Object.assign(new TypeError("Unknown option '--format'"), { code: 'ERR_PARSE_ARGS_UNKNOWN_OPTION' });
    expect(unknownOption(cause, ['formats'], ['--format', 'text'])).toEqual({ message: 'unknown option --format', hint: 'did you mean --formats?', fix: '--formats text' });
  });
});
