/**
 * What commander 15.1.0 changed, held here to literals as well as by its own suite in
 * `compat-oracle` (burgee#1494): five lines of `lib/`, each a case of its own below.
 */
import childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { scratchDirs } from '../__fixtures__/scratch-dir.js';
import { Command, Option } from '../commander.js';

const scratch = scratchDirs();

afterEach(() => {
  vi.restoreAllMocks();
});

describe('commander 15.1.0', () => {
  it('reads an exponent written with a capital E as part of a negative number', () => {
    const program = new Command().exitOverride().argument('<value>');
    program.parse(['-1E3'], { from: 'user' });
    expect(program.args).toEqual(['-1E3']);
  });

  it('keeps a help option in its group when its flag conflicts with an option of the program', () => {
    const short = new Command();
    short.option('-h, --host <host>');
    short.addHelpOption(new Option('-h, --help', 'display help').helpGroup('Information:'));
    expect(short.helpInformation()).toMatch(/Information:\n *--help +display help/);

    const long = new Command();
    long.option('--help <topic>');
    long.optionsGroup('Information:');
    long.helpOption(true);
    expect(long.helpInformation()).toMatch(/Information:\n *-h +display help/);
  });

  it('takes a global source only from a command that set one, not from a value set with none', () => {
    const program = new Command().enablePositionalOptions().option('-c, --common <value>');
    program.setOptionValueWithSource('common', 'from program', undefined as unknown as 'cli');
    const sub = program
      .command('sub')
      .option('-c, --common <value>')
      .action(() => undefined);
    program.parse(['sub', '--common', 'value'], { from: 'user' });
    expect(sub.getOptionValueSourceWithGlobals('common')).toBeUndefined();
  });

  it('reads a variadic option whose name ends in a non-ASCII letter', () => {
    expect(new Command().option('-c,--comma [café...]').options[0]?.variadic).toBe(true);
    expect(new Command().option('-c,--comma [value,...]').options[0]?.variadic).toBe(false);
  });

  it.each([
    ['--inspect-wait', '--inspect-wait=127.0.0.1:9230'],
    ['--inspect-wait=100', '--inspect-wait=127.0.0.1:101'],
    ['--inspect-wait=1.2.3.4:100', '--inspect-wait=1.2.3.4:101'],
    ['--inspect=[::1]', '--inspect=[::1]:9230'],
    ['--inspect=[::1]:100', '--inspect=[::1]:101'],
  ])('bumps the inspector port of %s for an executable subcommand', (given, expected) => {
    const dir = scratch('burgee-inspect-');
    writeFileSync(join(dir, 'tool-sub.js'), '');
    const spawn = vi
      .spyOn(childProcess, 'spawn')
      .mockImplementation(() => Object.assign(new EventEmitter(), { killed: true, exitCode: null }) as unknown as childProcess.ChildProcess);
    vi.spyOn(process, 'execArgv', 'get').mockReturnValue([given]);
    const program = new Command('tool').exitOverride().executableDir(dir);
    program.command('sub', 'a subcommand', { executableFile: 'tool-sub.js' });
    program.parse(['sub'], { from: 'user' });
    expect(spawn.mock.calls[0]?.[1]?.[0]).toBe(expected);
  });
});
