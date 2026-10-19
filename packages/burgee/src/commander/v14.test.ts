/**
 * `burgee/commander/v14` (`previous-majors` R1): commander 14's excess-arguments message,
 * which stops at the count, on the root and on a subcommand made by `.command()`; and
 * `burgee/commander`'s message, which names the surplus, unchanged beside it. commander 14's
 * own suite grades the entry in `compat-oracle` (`commander-14`); this pins the switch here.
 */
import { describe, expect, it } from 'vitest';

import { Command as Current } from '../commander.js';

import { Command, CommanderError, createCommand, program } from './v14.js';

/** The message `parse()` fails with, through `.exitOverride()` so nothing exits. */
const failure = (cmd: Current, argv: string[]): string => {
  cmd.exitOverride().configureOutput({ writeErr: () => undefined });
  try {
    cmd.parse(argv, { from: 'user' });
  } catch (error) {
    if (error instanceof CommanderError) return error.message;
    throw error;
  }
  return '';
};

describe('burgee/commander/v14', () => {
  it("stops the excess-arguments message at the count, as commander 14 does", () => {
    expect(failure(new Command(), ['excess'])).toBe('error: too many arguments. Expected 0 arguments but got 1.');
    expect(failure(new Command().argument('<file>'), ['a', 'b', 'c'])).toBe('error: too many arguments. Expected 1 argument but got 3.');
  });

  it("gives a subcommand made by .command() 14's message, naming the subcommand", () => {
    const root = createCommand();
    root.command('sub').action(() => undefined);
    for (const cmd of root.commands) cmd.exitOverride().configureOutput({ writeErr: () => undefined });
    expect(failure(root, ['sub', 'excess'])).toBe("error: too many arguments for 'sub'. Expected 0 arguments but got 1.");
  });

  it('allows excess arguments when told to, as commander does', () => {
    expect(failure(new Command().allowExcessArguments(), ['excess'])).toBe('');
  });

  it('exports a root program of its own class', () => {
    expect(program).toBeInstanceOf(Command);
    expect(program).toBeInstanceOf(Current);
  });

  it("leaves burgee/commander's message, which names the surplus, as it was", () => {
    expect(failure(new Current(), ['excess'])).toBe('error: too many arguments. Expected 0 arguments but got 1: excess.');
  });
});
