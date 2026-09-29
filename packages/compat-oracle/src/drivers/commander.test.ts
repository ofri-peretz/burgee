import { ExitCode } from 'burgee/testing';
import { Command, CommanderError } from 'commander';
import { describe, expect, it } from 'vitest';

import { isCommanderExit, mapCommanderExit, runCommander } from './commander.js';

describe('mapCommanderExit', () => {
  it('recognises a commander error from another copy of commander by shape', () => {
    expect(isCommanderExit({ code: 'commander.unknownCommand', exitCode: 1 })).toBe(true);
    expect(isCommanderExit(new Error('x'))).toBe(false);
  });

  it('treats help and version as OK, program.error codes as given, the rest as USAGE', () => {
    expect(mapCommanderExit(new CommanderError(0, 'commander.helpDisplayed', ''))).toBe(ExitCode.OK);
    expect(mapCommanderExit(new CommanderError(0, 'commander.version', ''))).toBe(ExitCode.OK);
    expect(mapCommanderExit(new CommanderError(ExitCode.CONFIG, 'commander.error', ''))).toBe(ExitCode.CONFIG);
    expect(mapCommanderExit(new CommanderError(1, 'commander.unknownOption', ''))).toBe(ExitCode.USAGE);
    expect(mapCommanderExit(new CommanderError(1, 'commander.missingArgument', ''))).toBe(ExitCode.USAGE);
  });
});

describe('runCommander', () => {
  it('never lets commander reach the real process: output and exit are captured', async () => {
    const program = new Command('t').exitOverride();
    program.command('hi').action(() => {
      console.log('hi there');
    });
    const r = await runCommander(program, { argv: ['hi'] });
    expect(r).toMatchObject({ code: ExitCode.OK, stdout: 'hi there\n', stderr: '' });
    const bad = await runCommander(program, { argv: ['--nope'] });
    expect(bad.code).toBe(ExitCode.USAGE);
    expect(bad.stderr).toMatch(/unknown option/);
  });

  it('sends commander’s own output — help, for one — to the fake stdout of every subcommand too', async () => {
    const program = new Command('t');
    program.command('sub').description('a subcommand');
    const r = await runCommander(program, { argv: ['sub', '--help'] });
    expect(r.code).toBe(ExitCode.OK);
    expect(r.stdout).toContain('Usage: t sub');
    expect(r.stderr).toBe('');
  });

  it('keeps an E1 code a thrown error carries, and says nothing extra for it', async () => {
    const program = new Command('t').action(() => {
      throw Object.assign(new Error('bad config'), { exitCode: ExitCode.CONFIG });
    });
    const r = await runCommander(program, { argv: [] });
    expect(r).toMatchObject({ code: ExitCode.CONFIG, stderr: '' });
  });

  it('reports anything else thrown as RUNTIME, with its message — or itself, when it is not an Error', async () => {
    const r = await runCommander(
      new Command('t').action(() => {
        throw new Error('kaboom');
      }),
      { argv: [] },
    );
    expect(r).toMatchObject({ code: ExitCode.RUNTIME, stderr: 'kaboom\n' });
    const bare = await runCommander(
      new Command('t').action(() => {
        throw 'plain string';
      }),
      { argv: [] },
    );
    expect(bare).toMatchObject({ code: ExitCode.RUNTIME, stderr: 'plain string\n' });
  });

  it('builds the program against the fake runtime when given a factory', async () => {
    const r = await runCommander(
      (rt) =>
        new Command('t').action(() => {
          rt.stdout.write(`tty=${rt.isTTY.stdout}\n`);
        }),
      { argv: [], tty: true },
    );
    expect(r.stdout).toBe('tty=true\n');
  });
});
