import { ExitCode } from 'burgee/testing';
import { describe, expect, it } from 'vitest';
import { type Argv } from 'yargs';

import { runYargs } from './yargs.js';

const ignore = (): undefined => undefined;

describe('runYargs', () => {
  it('never lets yargs reach the real process: output, failures and exit are captured', async () => {
    const r = await runYargs(
      (y) =>
        y
          .command('hi', 'say hi', {}, () => {
            console.log('hi there');
          })
          .strict(),
      { argv: ['hi'] },
    );
    expect(r).toMatchObject({ code: ExitCode.OK, stdout: 'hi there\n', stderr: '' });
    const bad = await runYargs((y) => y.command('hi', 'say hi', {}, () => undefined).strict(), { argv: ['nope'] });
    expect(bad.code).toBe(ExitCode.USAGE);
    expect(bad.stderr).toMatch(/Unknown argument|unknown command/i);
  });

  it('a throwing handler is RUNTIME with the message on stderr', async () => {
    const r = await runYargs(
      (y) =>
        y.command('boom', 'throw', {}, () => {
          throw new Error('kaboom');
        }),
      { argv: ['boom'] },
    );
    expect(r.code).toBe(ExitCode.RUNTIME);
    expect(r.stderr).toContain('kaboom');
  });

  it('keeps an E1 code a handler’s error carries, and reports a non-Error by itself', async () => {
    const config = await runYargs(
      (y) =>
        y.command('cfg', 'x', {}, () => {
          throw Object.assign(new Error('bad config'), { exitCode: ExitCode.CONFIG });
        }),
      { argv: ['cfg'] },
    );
    expect(config).toMatchObject({ code: ExitCode.CONFIG, stderr: '' });
    const bare = await runYargs(
      (y) =>
        y.command('str', 'x', {}, () => {
          throw 'plain string';
        }),
      { argv: ['str'] },
    );
    expect(bare).toMatchObject({ code: ExitCode.RUNTIME, stderr: 'plain string\n' });
  });

  it('is USAGE with nothing printed when yargs fails without a message', async () => {
    // Through the factory seam: an instance whose parse reports a failure with neither.
    let onFail: (msg: string | undefined, err: unknown) => void = ignore;
    const instance = {
      exitProcess: () => instance,
      showHelpOnFail: () => instance,
      fail: (handler: typeof onFail) => {
        onFail = handler;
        return instance;
      },
      parseAsync: async () => {
        onFail(undefined, undefined);
        return {};
      },
    };
    const r = await runYargs((y) => y, { argv: [] }, () => instance as unknown as Argv);
    expect(r).toMatchObject({ code: ExitCode.USAGE, stderr: '' });
  });

  it('renders --help itself, without parsing', async () => {
    const r = await runYargs((y) => y.command('hi', 'say hi', {}, () => undefined), { argv: ['--help'] });
    expect(r.code).toBe(ExitCode.OK);
    expect(r.stdout).toMatch(/say hi/);
  });
});
