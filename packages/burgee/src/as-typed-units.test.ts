/**
 * `--explain` names the flag as it was typed (`as-typed.ts`): a boolean set off by its `--no-`
 * spelling is explained as `--no-<name>`, not as the `--<name>` it is declared under, and an
 * option that is only named `no-…` keeps its own flag.
 */
import { describe, expect, it } from 'vitest';

import { defineCommand, defineProgram, runCommand } from './execute.js';

const program = defineProgram({ name: 'app', commands: [defineCommand({ name: 'go', effects: 'read_only', options: { shade: { type: 'boolean' } }, run: () => 'x' })] });

describe('--explain names the flag as typed', () => {
  it('explains a boolean turned off as --no-<name>', async () => {
    expect((await runCommand(program, ['go', '--no-shade', '--explain', 'shade'])).stdout).toMatch(/^shade = false {3}from flag --no-shade\n/u);
  });

  it('leaves an option named no-<name> its own flag when <name> is not a boolean', async () => {
    const two = defineProgram({ name: 'app', commands: [defineCommand({ name: 'go', effects: 'read_only', options: { cache: { type: 'string' }, noCache: { type: 'string' } }, run: () => 'x' })] });
    expect((await runCommand(two, ['go', '--cache', 'a', '--no-cache', 'b', '--explain', 'cache'])).stdout).toMatch(/^cache = "a" {3}from flag --cache\n/u);
  });
});
