import { ExitCode } from '@interlace/cli-core';
import { Command, CommanderError } from 'commander';
import { describe, expect, it } from 'vitest';

import { isCommanderExit, mapCommanderExit, runCommander } from './index.js';

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
