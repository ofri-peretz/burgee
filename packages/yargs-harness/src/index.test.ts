import { ExitCode } from '@interlace/cli-core';
import { describe, expect, it } from 'vitest';

import { runYargs } from './index.js';

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

  it('renders --help itself, without parsing', async () => {
    const r = await runYargs((y) => y.command('hi', 'say hi', {}, () => undefined), { argv: ['--help'] });
    expect(r.code).toBe(ExitCode.OK);
    expect(r.stdout).toMatch(/say hi/);
  });
});
