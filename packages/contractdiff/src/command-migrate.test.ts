import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ExitCode } from 'burgee';
import { runBurgee } from 'burgee/testing';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { scratchDirs } from './__fixtures__/kit/scratch-dir.js';
import { command, project, SOURCES } from './command-migrate.js';

import { program } from './index.js';

const scratch = scratchDirs();
const root = scratch('apicontract-migrate-');

/** What the command returned, out of burgee's `--json` envelope. */
const data = (r: { json?: unknown }): Record<string, unknown> => (r.json as { data: Record<string, unknown> }).data;

/** A project folder with these files. */
const make = (name: string, files: Record<string, string>): string => {
  const directory = join(root, name);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(directory, path, '..'), { recursive: true });
    writeFileSync(join(directory, path), text);
  }
  return directory;
};

const pkg = (scripts: Record<string, string>): string => `${JSON.stringify({ scripts }, undefined, 2)}\n`;

beforeAll(async () => {
  // Every run that is not given a directory writes into a scratch one, never the package's own.
  vi.spyOn(process, 'cwd').mockReturnValue(join(root, 'elsewhere'));
  await runBurgee(program, { argv: ['--version'] });
});


describe('`contractdiff migrate`', () => {
  it('is declared for --help, --schema and the MCP tool list', () => {
    expect(command.description).toBe('Switch from openapi-typescript, openapi-fetch, Hey API or orval: their config in, ours out');
    expect(command.arguments).toEqual([
      { name: 'from', description: 'the tool to migrate from', choices: ['openapi-typescript', 'openapi-fetch', 'hey-api', 'orval'], required: true },
      { name: 'dir', description: 'the project to migrate. Defaults to the current directory', required: false },
    ]);
    expect(command.options).toEqual({ dryRun: { type: 'boolean', description: 'report what would change; write nothing' } });
    expect(command.examples).toEqual([
      { command: 'contractdiff migrate openapi-typescript', description: 'redocly.yaml and the scripts that run it, as contractdiff.config.json' },
      { command: 'contractdiff migrate orval --dry-run --json', description: 'the config, the edits and every finding, as data; nothing written' },
    ]);
  });

  it('looks for each incumbent’s config files in its own order', () => {
    expect(Object.fromEntries(Object.entries(SOURCES).map(([name, source]) => [name, source.configs]))).toEqual({
      'openapi-typescript': ['redocly.yaml', '.redocly.yaml'],
      'openapi-fetch': ['redocly.yaml', '.redocly.yaml'],
      'hey-api': ['openapi-ts.config.ts', 'openapi-ts.config.mts', 'openapi-ts.config.cts', 'openapi-ts.config.js', 'openapi-ts.config.mjs', 'openapi-ts.config.cjs'],
      orval: ['orval.config.ts', 'orval.config.mts', 'orval.config.js', 'orval.config.mjs', 'orval.config.cjs'],
    });
  });

  it('writes the config beside the incumbent’s, applies the edits, then changes nothing on a second run', async () => {
    const directory = make('fetch', {
      'package.json': pkg({ types: 'openapi-typescript api.yaml -o src/api.d.ts' }),
      '.redocly.yaml': 'rules: {}\n',
      'src/app.ts': "import createClient from 'openapi-fetch';\nexport const c = createClient<paths>({});\n",
      'node_modules/openapi-fetch/index.ts': "import x from 'openapi-fetch';",
      'notes.md': 'openapi-fetch',
    });
    const first = await runBurgee(program, { argv: ['migrate', 'openapi-fetch', directory, '--json'] });
    expect(first.code).toBe(ExitCode.OK);
    expect(data(first)).toEqual({
      changed: true,
      read: ['.redocly.yaml', 'package.json'],
      config: { input: 'api.yaml', targets: { types: { generator: 'types', out: 'src', options: { compat: 'openapi-typescript' } }, fetch: { generator: 'fetch', out: 'src' } } },
      written: ['contractdiff.config.json'],
      unchanged: [],
      kept: [],
      edited: ['package.json', 'src/app.ts'],
      findings: [
        { code: 'option-dropped', pointer: 'redocly.yaml#/rules', message: '`rules` configures Redocly, not the types', fix: 'keep redocly.yaml for `redocly lint`; contractdiff does not read it' },
        expect.objectContaining({ code: 'output-renamed', pointer: 'package.json#/scripts/types' }),
      ],
      uninstall: 'npm uninstall openapi-fetch openapi-typescript',
    });
    expect(JSON.parse(readFileSync(join(directory, 'contractdiff.config.json'), 'utf8'))).toEqual(data(first).config);
    expect(readFileSync(join(directory, 'package.json'), 'utf8')).toBe(pkg({ types: 'contractdiff gen' }));
    expect(readFileSync(join(directory, '.redocly.yaml'), 'utf8')).toBe('rules: {}\n');
    expect(readFileSync(join(directory, 'node_modules/openapi-fetch/index.ts'), 'utf8')).toBe("import x from 'openapi-fetch';");
    const second = await runBurgee(program, { argv: ['migrate', 'openapi-fetch', directory, '--json'] });
    expect(data(second)).toMatchObject({ changed: false, config: null, written: [], unchanged: [], kept: [], edited: [] });
  });

  it('writes nothing with --dry-run', async () => {
    const directory = make('dry', { 'package.json': pkg({ api: 'orval' }), 'orval.config.ts': "export default { p: { input: 'a.yaml', output: 'o.ts' } }" });
    const r = await runBurgee(program, { argv: ['migrate', 'orval', directory, '--dry-run', '--json'] });
    expect(data(r)).toMatchObject({ changed: false, read: ['orval.config.ts', 'package.json'], written: [], unchanged: [], kept: [], edited: ['package.json'] });
    expect(readFileSync(join(directory, 'package.json'), 'utf8')).toBe(pkg({ api: 'orval' }));
    // Its text names what a run would write, by path.
    const text = await runBurgee(program, { argv: ['migrate', 'orval', directory, '--dry-run'] });
    expect(text.stdout).toContain('\nwould write contractdiff.config.json\nwould edit package.json\n');
  });

  it('keeps a config the user already has, and reports a change for edits alone', async () => {
    const directory = make('kept', { 'package.json': pkg({ api: 'openapi-ts -i a.yaml' }), 'contractdiff.config.json': '{}\n' });
    const r = await runBurgee(program, { argv: ['migrate', 'hey-api', directory, '--json'] });
    expect(data(r)).toMatchObject({ changed: true, read: ['package.json'], written: [], kept: ['contractdiff.config.json'], edited: ['package.json'] });
    expect(readFileSync(join(directory, 'contractdiff.config.json'), 'utf8')).toBe('{}\n');
  });

  it('migrates the current directory without one', async () => {
    const directory = make('cwd', { 'package.json': pkg({ t: 'openapi-typescript a.yaml -o a.ts' }) });
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(directory);
    try {
      const r = await runBurgee(program, { argv: ['migrate', 'openapi-typescript', '--json'] });
      expect(data(r)).toMatchObject({ changed: true, written: ['contractdiff.config.json'] });
    } finally {
      cwd.mockReturnValue(join(root, 'elsewhere'));
    }
  });

  it('writes a config gen reads as openapi-typescript wrote: types.ts in the -o folder, not under a folder named for the file', async () => {
    const directory = make('then-gen', {
      'package.json': pkg({ gen: 'openapi-typescript ./openapi.yaml -o src/api/types.ts' }),
      'openapi.yaml': "openapi: 3.1.0\ninfo: { title: t, version: '1' }\npaths: {}\n",
    });
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(directory);
    try {
      const migrated = await runBurgee(program, { argv: ['migrate', 'openapi-typescript', '--json'] });
      expect(data(migrated)).toMatchObject({ read: ['package.json'], config: { targets: { types: { out: 'src/api' } } }, findings: [] });
      const generated = await runBurgee(program, { argv: ['gen', '--json'] });
      expect(generated.code).toBe(ExitCode.OK);
      expect((data(generated).files as { path: string }[]).map((file) => file.path)).toEqual(['src/api/types.ts', 'contractdiff.map.json']);
    } finally {
      cwd.mockReturnValue(join(root, 'elsewhere'));
    }
  });

  it('refuses an incumbent it does not know', async () => {
    const r = await runBurgee(program, { argv: ['migrate', 'swagger-codegen', root, '--json'] });
    expect(r.code).toBe(ExitCode.USAGE);
  });
});

describe('reading the project', () => {
  it('reads package.json and every source, and nothing in a dependency, build or version-control folder', async () => {
    const files = Object.fromEntries(
      ['package.json', 'xpackage.json', 'a.ts', 'b.cts', 'c.mjs', 'd.jsx', 'e.tsx', 'f.ts.bak', 'g.json', 'sub/package.json', 'sub/h.js'].map((path) => [path, path]),
    );
    for (const skipped of ['node_modules', 'dist', 'build', 'coverage', '.git', '.next', '.turbo']) files[`${skipped}/x.ts`] = 'x';
    const directory = make('walk', files);
    symlinkSync(join(directory, 'a.ts'), join(directory, 'link.ts'));
    expect(Object.keys(await project(directory)).toSorted()).toEqual(['a.ts', 'b.cts', 'c.mjs', 'd.jsx', 'e.tsx', 'package.json', 'sub/h.js', 'sub/package.json']);
    expect((await project(directory))['sub/h.js']).toBe('sub/h.js');
  });

  it('reports a change when it writes the config and edits nothing', async () => {
    const directory = make('config-only', { 'redocly.yaml': 'apis:\n  a:\n    root: a.yaml\n    x-openapi-ts:\n      output: a.ts\n' });
    const r = await runBurgee(program, { argv: ['migrate', 'openapi-typescript', directory, '--json'] });
    expect(data(r)).toMatchObject({ changed: true, read: ['redocly.yaml'], written: ['contractdiff.config.json'], edited: [] });
  });
});

