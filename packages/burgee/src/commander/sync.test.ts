/**
 * `parse()` on the commander façade is synchronous, exactly as commander's is: a
 * program whose action is synchronous has run it by the time `parse()` returns, for the
 * root command and for a subcommand alike. commander's own suite asserts on that
 * everywhere (`program.parse(...)` then an immediate `assert`), so the 638 tests that
 * fell when the burgee surface check went async were the symptom; this is the check
 * that names the cause, and it was red on the unfixed state.
 */
import { describe, expect, it } from 'vitest';

import { Command } from '../commander.js';

describe('commander façade: parse() stays synchronous', () => {
  it('runs a root action before parse() returns', () => {
    const calls: string[][] = [];
    const program = new Command();
    program.argument('<file>').action((file: string) => {
      calls.push([file]);
    });
    program.parse(['node', 'test', 'a.txt']);
    expect(calls).toEqual([['a.txt']]);
  });

  it('runs a subcommand action before parse() returns', () => {
    const calls: string[] = [];
    const program = new Command();
    program.command('info').action(() => {
      calls.push('info');
    });
    program.parse(['node', 'test', 'info']);
    expect(calls).toEqual(['info']);
  });

  it('still serves --schema, which is synchronous too', () => {
    const out: string[] = [];
    const program = new Command('tool');
    program.configureOutput({ writeOut: (s) => void out.push(s) });
    program.command('info').action(() => undefined);
    program.parse(['node', 'test', '--schema']);
    expect(out.join('')).toContain('"info"');
  });
});
