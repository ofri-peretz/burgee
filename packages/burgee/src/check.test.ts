/**
 * `checkPlugin` in-process. `scripts/plugin-check-lock.test.ts` drives `burgee check` as a
 * binary, in the workspace's own process, so none of it reaches this package's counter; the
 * cases here are the report's rows and each way a plugin is refused, read off the returned
 * document rather than off prose.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { checkPlugin } from './check.js';
import { ExitCode } from './exit-code.js';

const dir = mkdtempSync(join(tmpdir(), 'burgee-check-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let n = 0;
/** A plugin module on disk, since `checkPlugin` takes a path and imports it. */
const plugin = (source: string): string => {
  n += 1;
  const file = join(dir, `plugin-${String(n)}.mjs`);
  writeFileSync(file, source);
  return file;
};

describe('burgee check reports what a plugin contributes', () => {
  it('lists each command with its description and effects, and each hook with what it applies to', async () => {
    const file = plugin(`export default {
      name: 'audit',
      contract: 1,
      commands: [
        { path: ['audit', 'run'], description: 'Run the audit', effects: 'read_only', options: {}, run: () => 'ok' },
        { path: ['audit'], options: {} },
      ],
      hooks: { preRun: { handler: () => undefined }, onError: { filter: { command: /^deploy/ }, handler: () => undefined } },
    };\n`);
    expect(await checkPlugin(file)).toEqual({
      name: 'audit',
      commands: [
        { path: 'audit run', description: 'Run the audit', effects: 'read_only' },
        // A group declares no effects and no description; the report says so rather than omitting the row.
        { path: 'audit', description: '', effects: 'undeclared' },
      ],
      hooks: [
        { stage: 'preRun', applies: 'every command' },
        { stage: 'onError', applies: 'commands matching /^deploy/' },
      ],
    });
  });

  it('reads a module with no default export as the plugin itself', async () => {
    const file = plugin("export const name = 'bare';\nexport const contract = 1;\nexport const hooks = { postRun: { handler: () => undefined } };\n");
    expect(await checkPlugin(file)).toEqual({ name: 'bare', commands: [], hooks: [{ stage: 'postRun', applies: 'every command' }] });
  });

  it('reports a plugin with commands and no hooks', async () => {
    const file = plugin("export default { name: 'cmds', contract: 1, commands: [{ path: ['x'], effects: 'idempotent', options: {}, run: () => ({ changed: false }) }] };\n");
    expect(await checkPlugin(file)).toEqual({ name: 'cmds', commands: [{ path: 'x', description: '', effects: 'idempotent' }], hooks: [] });
  });
});

describe('burgee check refuses, as data, with an exit code', () => {
  it('refuses a plugin that contributes nothing burgee reads', async () => {
    const file = plugin("export default { name: 'empty', contract: 1, commands: [] };\n");
    expect(await checkPlugin(file)).toEqual({
      refused: {
        code: 'E_NO_CONTRIBUTION',
        message: 'empty registers, but contributes nothing burgee reads',
        fix: 'add `commands` or `hooks` — a key another package in the family reads is allowed in the same object, but `burgee check` cannot show it',
      },
      exitCode: ExitCode.RUNTIME,
    });
  });

  it('refuses under the plugin host’s own code', async () => {
    const file = plugin("export default { name: 'old' };\n");
    expect(await checkPlugin(file)).toMatchObject({ refused: { code: 'E_PLUGIN_CONTRACT', message: expect.stringContaining('plugin "old" declares no contract') }, exitCode: ExitCode.RUNTIME });
  });

  it('refuses a plugin whose object throws while it is read, with the error’s own words', async () => {
    const file = plugin("export default { name: 'getter', contract: 1, get hooks() { throw new Error('hooks exploded'); } };\n");
    expect(await checkPlugin(file)).toEqual({
      refused: { code: 'E_PLUGIN_SCHEMA', message: 'hooks exploded', fix: 'fix the contributed command the message names; it is checked exactly as one of the program’s own' },
      exitCode: ExitCode.RUNTIME,
    });
  });

  it('rethrows what is not an Error at all, rather than inventing a message for it', async () => {
    const file = plugin("export default { name: 'thrower', contract: 1, get commands() { throw 'not an error'; } };\n");
    await expect(checkPlugin(file)).rejects.toBe('not an error');
  });
});
