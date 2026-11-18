import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ExitCode } from 'burgee';
import { runBurgee } from 'burgee/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { command } from './command-plugin.js';
import { program } from './index.js';
import { scaffold } from './scaffold.js';

/** What the command returned, out of burgee's `--json` envelope. */
const data = (r: { json?: unknown }): unknown => (r.json as { data?: unknown }).data;

const directory = mkdtempSync(join(tmpdir(), 'apicontract-plugin-'));

beforeAll(async () => {
  await runBurgee(program, { argv: ['--version'] });
});

afterAll(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe('`apicontract plugin new`', () => {
  it('is described for --help and the MCP tool list', () => {
    expect(command.description).toBe('Scaffold a plugin that passes the conformance suite as generated');
  });

  it('writes a generator plugin by default, then nothing on a second run', async () => {
    const out = join(directory, 'default');
    const first = await runBurgee(program, { argv: ['plugin', 'new', 'pets', '--out', out, '--json'] });
    expect(first.code).toBe(ExitCode.OK);
    expect(data(first)).toEqual({ changed: true, written: ['plugin-pets.ts', 'plugin-pets.test.ts', 'README.md'], unchanged: [], kept: [], next: 'node --test plugin-pets.test.ts' });
    expect(readFileSync(join(out, 'plugin-pets.ts'), 'utf8')).toBe(scaffold('pets', 'generator')[0]?.content);
    const second = await runBurgee(program, { argv: ['plugin', 'new', 'pets', '--out', out, '--json'] });
    expect(data(second)).toEqual({ changed: false, written: [], unchanged: ['plugin-pets.ts', 'plugin-pets.test.ts', 'README.md'], kept: [], next: 'node --test plugin-pets.test.ts' });
  });

  it('writes the kind it is asked for', async () => {
    const out = join(directory, 'extractor');
    await runBurgee(program, { argv: ['plugin', 'new', 'source', '--kind', 'extractor', '--out', out, '--json'] });
    expect(readFileSync(join(out, 'plugin-source.ts'), 'utf8')).toBe(scaffold('source', 'extractor')[0]?.content);
  });

  it('writes into the current directory without --out', async () => {
    const out = join(directory, 'cwd');
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(out);
    try {
      const r = await runBurgee(program, { argv: ['plugin', 'new', 'here', '--json'] });
      expect(data(r)).toMatchObject({ written: ['plugin-here.ts', 'plugin-here.test.ts', 'README.md'] });
      expect(readFileSync(join(out, 'README.md'), 'utf8')).toBe(scaffold('here', 'generator')[2]?.content);
    } finally {
      cwd.mockRestore();
    }
  });

  it('refuses a name that is not one, with a fix line', async () => {
    const r = await runBurgee(program, { argv: ['plugin', 'new', '../escape', '--out', directory, '--json'] });
    expect(r.code).not.toBe(ExitCode.OK);
    expect(JSON.stringify(r.json)).toContain('is not a plugin name. fix: use lowercase letters');
  });
});
