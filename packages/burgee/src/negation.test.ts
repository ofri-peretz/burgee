/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Every boolean is negatable, because the precedence order requires it.
 *
 * `flag > env > config file > package.json field > default` lets any boolean arrive `true`
 * without the user typing anything — config and the package.json field set options *by
 * name*, not only ones with an `env` binding. A boolean flag carries no value, so
 * `--x=false` is refused. Before this, the top layer of that chain could only ever say
 * `true`:
 *
 *     --no-shout      exit 2   unknown option --no-shout  (hint: "did you mean --shout?")
 *     --shout=false   exit 2   does not take an argument
 *     --shout         exit 0   still true
 *
 * A boolean turned on in a config file could not be turned off from the command line at
 * all. That is the reason it is every boolean rather than a declared few: nothing can know
 * statically which of them a config file will set.
 */
import { describe, expect, it } from 'vitest';

import { defineCommand, defineProgram, ExitCode } from './index.js';
import { runBurgee } from './testing.js';

const program = defineProgram({
  name: 'app',
  commands: [
    defineCommand({
      name: 'go',
      options: { shout: { type: 'boolean', default: true }, quiet: { type: 'boolean', short: 'q' }, name: { type: 'string' } },
      run: ({ options }) => options,
    }),
  ],
});

const go = async (...flags: string[]): Promise<Record<string, unknown>> => {
  const r = await runBurgee(program, { argv: ['go', '--json', ...flags] });
  return (r.json as { data?: Record<string, unknown> }).data ?? {};
};

describe('a boolean that is on can be turned off', () => {
  it('--no-x overrides a default of true — the case with no other spelling', async () => {
    expect(await go()).toMatchObject({ shout: true });
    expect(await go('--no-shout')).toMatchObject({ shout: false });
  });

  it('--no-x on a boolean that defaults false is accepted and means false', async () => {
    expect(await go('--no-quiet')).toMatchObject({ quiet: false });
  });

  it('leaves the short form alone', async () => {
    expect(await go('-q')).toMatchObject({ quiet: true });
  });
});

describe('--x and --no-x together: the later one wins', () => {
  it.each([
    [['--shout', '--no-shout'], false],
    [['--no-shout', '--shout'], true],
  ])('%s', async (flags, expected) => {
    expect(await go(...flags)).toMatchObject({ shout: expected });
  });

  /**
   * The case that separates last-wins from *last distinct spelling* wins, and the reason
   * `canonical` reads the tokens rather than folding while it iterates `values`. parseArgs
   * inserts each key as it meets it, which looks ordered enough — but a third `--quiet`
   * re-writes the value at the existing key without moving its position, so `no-quiet`
   * stays second and stays winning. A version that folded `values` passed every two-flag
   * case above and got this one wrong.
   */
  it.each([
    [['--quiet', '--no-quiet', '--quiet'], true],
    [['--no-quiet', '--quiet', '--no-quiet'], false],
  ])('%s — three of them, not two', async (flags, expected) => {
    expect(await go(...flags)).toMatchObject({ quiet: expected });
  });
});

describe('what does not become negatable', () => {
  it('a string option: --no-name is still an unknown option', async () => {
    const r = await runBurgee(program, { argv: ['go', '--no-name'] });
    expect(r.code).toBe(ExitCode.USAGE);
    expect(r.stderr).toMatch(/unknown option --no-name/);
  });

  /**
   * `--no-config` means "load no config file", not `config: false`. `config` is a string
   * option, so the fold must not claim it — this is the one collision the rule has.
   */
  it('--no-config keeps meaning "load none"', async () => {
    const withConfig = defineProgram({
      name: 'app',
      config: { name: 'app' },
      commands: [defineCommand({ name: 'go', options: { shout: { type: 'boolean' } }, run: ({ options }) => options })],
    });
    const r = await runBurgee(withConfig, { argv: ['go', '--json', '--no-config'] });
    expect(r.code).toBe(ExitCode.OK);
    expect((r.json as { data?: Record<string, unknown> }).data).not.toHaveProperty('config');
  });
});
