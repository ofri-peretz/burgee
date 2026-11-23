import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ExitCode } from 'burgee';
import { runBurgee } from 'burgee/testing';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { scratchDirs } from './__fixtures__/kit/scratch-dir.js';
import { command } from './command-plugin.js';
import { scaffold } from './scaffold.js';

import { program } from './index.js';

/** What the command returned, out of burgee's `--json` envelope. */
const data = (r: { json?: unknown }): unknown => (r.json as { data?: unknown }).data;

const scratch = scratchDirs();
const directory = scratch('apicontract-plugin-');

beforeAll(async () => {
  // Every run that is not given a directory writes into a scratch one, never the package's own.
  vi.spyOn(process, 'cwd').mockReturnValue(join(directory, 'elsewhere'));
  await runBurgee(program, { argv: ['--version'] });
});


describe('`contractdiff plugin new`', () => {
  it('is described for --help, --schema and the MCP tool list', () => {
    expect(command.description).toBe('Scaffold a plugin that passes the conformance suite as generated');
    expect(command.arguments).toEqual([
      { name: 'action', description: '`new`: scaffold a plugin', choices: ['new'], required: true },
      { name: 'name', description: 'the plugin name: lowercase letters, digits and single dashes', required: true },
    ]);
    expect(command.options).toEqual({
      kind: { type: 'string', choices: ['generator', 'extractor', 'adapter', 'rules'], default: 'generator', description: 'what the plugin contributes: spec to code, code to spec, an input format, or lint rules' },
      from: { type: 'string', placeholder: 'finding.json', description: 'with --kind rules: seed the rule from one finding of `contractdiff lint --json`' },
      out: { type: 'string', placeholder: 'dir', description: 'directory to write into. Defaults to the current directory' },
    });
    expect(command.examples).toEqual([
      { command: 'contractdiff plugin new my-target', description: 'a generator plugin, its conformance test and a README' },
      { command: 'contractdiff plugin new my-source --kind extractor --out plugins', description: 'an extractor, written under plugins/' },
      { command: 'contractdiff plugin new no-bare-ids --kind rules --from finding.json', description: 'a lint rule that finds the mistake one finding named, with that as its sample' },
    ]);
  });

  it('refuses an action other than `new`', async () => {
    const r = await runBurgee(program, { argv: ['plugin', 'old', 'pets', '--json'] });
    expect(r.code).toBe(ExitCode.USAGE);
  });

  it('reports a change when it writes one file of three', async () => {
    const out = join(directory, 'partial');
    await runBurgee(program, { argv: ['plugin', 'new', 'one', '--out', out, '--json'] });
    rmSync(join(out, 'README.md'));
    const r = await runBurgee(program, { argv: ['plugin', 'new', 'one', '--out', out, '--json'] });
    expect(data(r)).toEqual({ changed: true, written: ['README.md'], unchanged: ['plugin-one.ts', 'plugin-one.test.ts'], kept: [], next: 'node --test plugin-one.test.ts' });
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
      cwd.mockReturnValue(join(directory, 'elsewhere'));
    }
  });

  it('seeds a rule from a finding, read from the current directory, and refuses --from for another kind', async () => {
    const out = join(directory, 'seeded');
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'api.json'), JSON.stringify({ openapi: '3.1.0', info: { title: 't', version: '1' }, paths: {} }));
    writeFileSync(join(out, 'finding.json'), JSON.stringify({ file: 'api.json', pointer: '#', message: '`info.description` is missing', fix: 'add it' }));
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(out);
    try {
      const r = await runBurgee(program, { argv: ['plugin', 'new', 'info-says', '--kind', 'rules', '--from', 'finding.json', '--json'] });
      expect(r.code).toBe(ExitCode.OK);
      expect(readFileSync(join(out, 'plugin-info-says.ts'), 'utf8')).toContain("given: { select: 'document' },");
      const wrong = await runBurgee(program, { argv: ['plugin', 'new', 'x', '--from', 'finding.json', '--json'] });
      expect(wrong.code).toBe(ExitCode.USAGE);
      expect(JSON.stringify(wrong.json)).toContain('--from seeds a rule, and --kind is generator. fix: pass --kind rules with --from');
    } finally {
      cwd.mockReturnValue(join(directory, 'elsewhere'));
    }
  });

  it('refuses a name that is not one, with a fix line', async () => {
    const r = await runBurgee(program, { argv: ['plugin', 'new', '../escape', '--out', directory, '--json'] });
    expect(r.code).not.toBe(ExitCode.OK);
    expect(JSON.stringify(r.json)).toContain('is not a plugin name. fix: use lowercase letters');
  });
});
