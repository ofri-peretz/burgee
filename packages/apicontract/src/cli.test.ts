import { ExitCode } from 'burgee';
import { runBurgee } from 'burgee/testing';
import { beforeAll, describe, expect, it } from 'vitest';

import { program } from './index.js';

const COMMANDS = ['diff', 'explain', 'gen', 'check'] as const;

describe('apicontract, Phase 0', () => {
  // burgee's first run loads its renderers lazily; paying that here keeps each case under 5 s.
  beforeAll(async () => {
    await runBurgee(program, { argv: ['--version'] });
  });

  it.each([
    ['diff', 'Phase 1'],
    ['explain', 'Phase 1'],
    ['gen', 'Phase 2'],
    ['check', 'Phase 4'],
  ])('declares `%s` and fails it with a fix line naming %s', async (command, phase) => {
    const r = await runBurgee(program, { argv: [command, '--json'] });
    expect(r.code).toBe(ExitCode.RUNTIME);
    expect(JSON.stringify(r.json)).toContain(`fix: it lands in ${phase}`);
  });

  it('declares every command read-only in its schema, so an agent may call any of them freely', async () => {
    const r = await runBurgee(program, { argv: ['--schema'] });
    expect(r.code).toBe(ExitCode.OK);
    const { commands } = JSON.parse(r.stdout) as { commands: { name: string; effects?: string }[] };
    const effects = Object.fromEntries(commands.map((c) => [c.name, c.effects]));
    for (const name of COMMANDS) expect(effects[name], name).toBe('read_only');
  });
});
