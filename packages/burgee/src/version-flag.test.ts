/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * V4 — `--version` answers on a program that is a pure command group.
 *
 * `dispatch` has always handled `--version`, but only once a command resolved. A program
 * whose root runs nothing resolves nothing for `app --version`, so it fell through to
 * `unknown command "--version"` and **exit 2**. Under E1 exit 2 means *rewrite the
 * command*, so an agent asked for a version would rewrite it until it gave up — on the
 * flag people and agents type first.
 *
 * It is also a compatibility divergence, which is why it matters twice: real commander and
 * real yargs both print the version and exit 0 for the identical program shape, measured
 * on `examples/demo-cli-commander` and `examples/demo-cli-yargs`.
 */
import { describe, expect, it } from 'vitest';

import { defineCommand, defineProgram, ExitCode } from './index.js';
import { runBurgee } from './testing.js';

/** A pure command group: the root declares no `run`, so nothing resolves for a bare flag. */
const group = defineProgram({
  name: 'app',
  version: '4.2.0',
  commands: [defineCommand({ name: 'greet', run: () => 'hi' })],
});

describe('V4 — the version flag on a command group', () => {
  it.each(['--version', '-V'])('%s prints the version and exits 0', async (flag) => {
    const r = await runBurgee(group, { argv: [flag] });
    expect(r.code).toBe(ExitCode.OK);
    expect(r.stdout).toBe('4.2.0\n');
  });

  it('still refuses a command that genuinely does not exist', async () => {
    // The point of the fix is one more accepted flag, not a looser resolver.
    const r = await runBurgee(group, { argv: ['nosuch'] });
    expect(r.code).toBe(ExitCode.USAGE);
    expect(r.stderr).toMatch(/unknown command "nosuch"/);
  });

  it('leaves `--help` where it was', async () => {
    const r = await runBurgee(group, { argv: ['--help'] });
    expect(r.code).toBe(ExitCode.OK);
    expect(r.stdout).toMatch(/Usage: app/);
  });
});
