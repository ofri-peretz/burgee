import { ExitCode } from 'burgee';
import { runBurgee } from 'burgee/testing';
import { beforeAll, describe, expect, it } from 'vitest';

import { program } from './index.js';

/** Each command with the roadmap phase that delivers it and what it does to the user's files. */
const COMMANDS = [
  ['gen', 'Phase 1', 'idempotent'],
  ['extract', 'Phase 2', 'idempotent'],
  ['explain', 'Phase 5', 'read_only'],
  ['diff', 'Phase 5', 'read_only'],
  ['check', 'Phase 7', 'read_only'],
] as const;

describe('apicontract, Phase 0', () => {
  // burgee's first run loads its renderers lazily; paying that here keeps each case under 5 s.
  beforeAll(async () => {
    await runBurgee(program, { argv: ['--version'] });
  });

  it.each(COMMANDS)('declares `%s` and fails it with a fix line naming %s', async (command, phase) => {
    const r = await runBurgee(program, { argv: [command, '--json'] });
    expect(r.code).toBe(ExitCode.RUNTIME);
    expect(JSON.stringify(r.json)).toContain(`fix: it lands in ${phase}`);
  });

  it('leads with the two commands that are the product: spec to code, and code to spec', async () => {
    const r = await runBurgee(program, { argv: ['--schema'] });
    const { commands } = JSON.parse(r.stdout) as { commands: { name: string }[] };
    expect(commands.map((c) => c.name).slice(0, 2)).toEqual(['gen', 'extract']);
  });

  it('declares what each command does to files: the two that write say so, the rest are read-only for an agent', async () => {
    const r = await runBurgee(program, { argv: ['--schema'] });
    expect(r.code).toBe(ExitCode.OK);
    const { commands } = JSON.parse(r.stdout) as { commands: { name: string; effects?: string }[] };
    const effects = Object.fromEntries(commands.map((c) => [c.name, c.effects]));
    for (const [name, , effect] of COMMANDS) expect(effects[name], name).toBe(effect);
  });
});
