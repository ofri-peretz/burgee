import { copyFileSync, existsSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ExitCode } from 'burgee';
import { runBurgee } from 'burgee/testing';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { scratchDirs } from './__fixtures__/run/scratch-dir.js';
import { program } from './cli.js';
import { gen, requireConfig } from './run-gen.js';
import { withHeader } from './run-header.js';


const scratch = scratchDirs();
const FIXTURES = fileURLToPath(new URL('__fixtures__/', import.meta.url));

/** A project in a temporary folder: the spine's test plugin, a spec and a config. */
const project = (config: Record<string, unknown> = {}, spec = 'run/pets.openapi.yaml'): string => {
  const root = realpathSync(scratch('apicontract-gen-'));
  copyFileSync(join(FIXTURES, spec), join(root, 'openapi.yaml'));
  copyFileSync(join(FIXTURES, 'run/plugin.mjs'), join(root, 'plugin.mjs'));
  const written = { input: 'openapi.yaml', plugins: ['./plugin.mjs'], targets: { types: { generator: 'types', out: 'src/gen' } }, ...config };
  writeFileSync(join(root, 'apicontract.config.json'), `${JSON.stringify(written)}\n`);
  return root;
};

const read = (root: string, path: string): string => readFileSync(join(root, path), 'utf8');
const header = (path: string, body: string): string => withHeader(path, body, 'apicontract gen');

const failure = async (attempt: Promise<unknown>): Promise<{ message: string; code: unknown }> => {
  try {
    await attempt;
  } catch (error) {
    return error as { message: string; code: unknown };
  }
  throw new Error('expected a refusal');
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('gen', () => {
  it('writes the files the generator declares for id.openapi.yaml, and a second run changes nothing', async () => {
    const root = project({}, 'id.openapi.yaml');
    const first = await gen({ cwd: root });
    expect(first).toStrictEqual({
      files: [
        { path: 'src/gen/handlers.ts', owner: 'user', action: 'write', target: 'types' },
        { path: 'src/gen/schemas.json', owner: 'generated', action: 'write', target: 'types' },
        { path: 'src/gen/types.ts', owner: 'generated', action: 'write', target: 'types' },
        { path: 'apicontract.map.json', owner: 'generated', action: 'write' },
      ],
      changed: true,
      changes: 4,
      unchanged: 0,
      skipped: 0,
      findings: [{ code: 'no-operations', pointer: '/paths', message: 'the spec declares no operations', fix: 'add paths to the spec', target: 'types' }],
    });
    // The sample's bodies, with the header on the file that has comments.
    expect(read(root, 'src/gen/types.ts')).toBe(header('types.ts', 'export type Id = unknown;\n'));
    expect(read(root, 'src/gen/schemas.json')).toBe('["Id"]\n');
    expect(read(root, 'src/gen/handlers.ts')).toBe('// implement the handlers here\n');
    const second = await gen({ cwd: root });
    expect(second.changed).toBe(false);
    expect(second.changes).toBe(0);
    expect(second.unchanged).toBe(3);
    expect(second.skipped).toBe(1);
    // A run that changes one file, the map, still says it changed something.
    rmSync(join(root, 'apicontract.map.json'));
    expect(await gen({ cwd: root })).toMatchObject({ changed: true, changes: 1 });
  });

  it('maps each operation to the files and symbols generated for it', async () => {
    const root = project();
    await gen({ cwd: root });
    const map = JSON.parse(read(root, 'apicontract.map.json')) as { operations: Record<string, unknown>; files: Record<string, unknown> };
    expect(map.operations).toEqual({
      addPet: [
        { file: 'src/gen/handlers.ts', symbol: 'addPet', target: 'types' },
        { file: 'src/gen/types.ts', symbol: 'AddPet', target: 'types' },
      ],
      listPets: [
        { file: 'src/gen/handlers.ts', symbol: 'listPets', target: 'types' },
        { file: 'src/gen/types.ts', symbol: 'ListPets', target: 'types' },
      ],
    });
    expect(Object.keys(map.files)).toEqual(['src/gen/schemas.json', 'src/gen/types.ts']);
  });

  it('edits zero bytes of a user file when the spec changes and gen runs again (N1 = 0)', async () => {
    const root = project();
    await gen({ cwd: root });
    writeFileSync(join(root, 'src/gen/handlers.ts'), 'export const listPets = () => [];\n');
    const user = readFileSync(join(root, 'src/gen/handlers.ts'));
    writeFileSync(join(root, 'openapi.yaml'), read(root, 'openapi.yaml').replace('Pet:', 'Owner:\n      type: object\n    Pet:'));
    const report = await gen({ cwd: root });
    expect(readFileSync(join(root, 'src/gen/handlers.ts')).equals(user)).toBe(true);
    expect(report.files.find((file) => file.path === 'src/gen/handlers.ts')?.action).toBe('skip');
    expect(read(root, 'src/gen/types.ts')).toBe(header('types.ts', 'export type Owner = unknown;\nexport type Pet = unknown;\n'));
  });

  it('refuses to overwrite a hand edit inside a generated file, unless forced', async () => {
    const root = project();
    await gen({ cwd: root });
    writeFileSync(join(root, 'src/gen/types.ts'), `${read(root, 'src/gen/types.ts')}export type Mine = 1;\n`);
    writeFileSync(join(root, 'src/gen/schemas.json'), '["Mine"]\n');
    const error = await failure(gen({ cwd: root, targets: ['types'], check: false, dryRun: false }));
    expect(error.message).toBe('generated files were edited by hand: src/gen/schemas.json, src/gen/types.ts. fix: move the change to a user file, or pass --force');
    expect(read(root, 'src/gen/schemas.json')).toBe('["Mine"]\n');
    const forced = await gen({ cwd: root, force: true });
    expect(forced.changes).toBe(2);
    expect(read(root, 'src/gen/schemas.json')).toBe('["Pet"]\n');
  });

  it('checks without writing: exit 1 and the stale files after the spec changes, clean after gen', async () => {
    const root = project();
    const before = await gen({ cwd: root, check: true });
    expect(before).toMatchObject({ stale: ['src/gen/handlers.ts', 'src/gen/schemas.json', 'src/gen/types.ts', 'apicontract.map.json'], exitCode: 1, fix: 'run `apicontract gen` and commit the result' });
    expect(existsSync(join(root, 'src/gen'))).toBe(false);
    await gen({ cwd: root });
    const clean = await gen({ cwd: root, check: true });
    expect(clean.stale).toEqual([]);
    expect(clean).not.toHaveProperty('exitCode');
    expect(clean).not.toHaveProperty('fix');
    writeFileSync(join(root, 'openapi.yaml'), read(root, 'openapi.yaml').replace('Pet:', 'Cat:'));
    expect(await gen({ cwd: root, check: true })).toMatchObject({ stale: ['src/gen/schemas.json', 'src/gen/types.ts', 'apicontract.map.json'], exitCode: 1 });
  });

  it('prints the diff a run would write, and writes nothing', async () => {
    const root = project();
    await gen({ cwd: root });
    writeFileSync(join(root, 'openapi.yaml'), read(root, 'openapi.yaml').replace('Pet:', 'Cat:'));
    const report = await gen({ cwd: root, dryRun: true });
    expect(report.diff).toBe(
      [
        '--- a/src/gen/schemas.json',
        '+++ b/src/gen/schemas.json',
        '@@ -1,1 +1,1 @@',
        '-["Pet"]',
        '+["Cat"]',
        '--- a/src/gen/types.ts',
        '+++ b/src/gen/types.ts',
        '@@ -1,2 +1,2 @@',
        `-${header('types.ts', 'export type Pet = unknown;\n').split('\n')[0] ?? ''}`,
        '-export type Pet = unknown;',
        `+${header('types.ts', 'export type Cat = unknown;\n').split('\n')[0] ?? ''}`,
        '+export type Cat = unknown;',
        '',
      ].join('\n') + report.diff?.slice(report.diff.indexOf('--- a/apicontract.map.json')),
    );
    expect(report.diff).toContain('--- a/apicontract.map.json');
    expect(read(root, 'src/gen/schemas.json')).toBe('["Pet"]\n');
  });

  it('deletes a generated file the target no longer writes, and keeps the targets that did not run', async () => {
    const root = project({ targets: { types: { generator: 'types', out: 'src/gen' }, other: { generator: 'types', out: '.', options: { banner: '// b\n' } } } });
    await gen({ cwd: root });
    expect(read(root, 'types.ts')).toBe(header('types.ts', '// b\nexport type Pet = unknown;\n'));
    writeFileSync(join(root, 'apicontract.config.json'), JSON.stringify({ input: 'openapi.yaml', plugins: ['./plugin.mjs'], targets: { types: { generator: 'types', out: 'lib' }, other: { generator: 'types', out: '.', options: { banner: '// b\n' } } } }));
    const report = await gen({ cwd: root, targets: ['types'] });
    expect(report.files.filter((file) => file.action === 'delete').map((file) => `${file.path}:${file.target ?? ''}`)).toEqual(['src/gen/schemas.json:types', 'src/gen/types.ts:types']);
    expect(existsSync(join(root, 'src/gen/types.ts'))).toBe(false);
    expect(existsSync(join(root, 'src/gen/handlers.ts'))).toBe(true);
    const map = JSON.parse(read(root, 'apicontract.map.json')) as { files: Record<string, { target: string }> };
    expect(Object.keys(map.files)).toEqual(['lib/schemas.json', 'lib/types.ts', 'schemas.json', 'types.ts']);
  });

  it('runs every target when --target is empty, and only the named ones otherwise, in config order', async () => {
    const root = project({ targets: { b: { generator: 'types', out: 'b' }, a: { generator: 'types', out: 'a' } } });
    expect((await gen({ cwd: root, targets: [] })).files.map((file) => file.target)).toContain('b');
    rmSync(join(root, 'apicontract.map.json'));
    const report = await gen({ cwd: root, dryRun: true, targets: ['a'] });
    expect(new Set(report.files.map((file) => file.target))).toEqual(new Set(['a', undefined]));
  });

  it('refuses two targets that write the same file', async () => {
    const root = project({ targets: { a: { generator: 'types', out: 'x' }, b: { generator: 'types', out: 'x/' } } });
    expect((await failure(gen({ cwd: root }))).message).toBe('targets "a" and "b" both write "x/types.ts". fix: give them different `out` folders');
  });

  it('refuses a target that is not in the config, as a usage error', async () => {
    const error = await failure(gen({ cwd: project({ targets: { types: { generator: 'types', out: 'a' }, more: { generator: 'types', out: 'b' } } }), targets: ['types', 'typse'] }));
    expect(error).toMatchObject({ code: 'USAGE', message: 'no target is named "typse". fix: pass --target with one of: types, more' });
  });

  it('refuses a config without targets, without input, or no config at all, as config errors', async () => {
    const root = project({ targets: {} });
    expect(await failure(gen({ cwd: root }))).toMatchObject({ code: 'CONFIG', message: expect.stringContaining('it has no `targets`. fix: add `"targets": { "types": { "generator": "types", "out": "src/generated" } }`') as unknown });
    writeFileSync(join(root, 'apicontract.config.json'), '{ "targets": { "t": { "generator": "types", "out": "o" } } }');
    expect(await failure(gen({ cwd: root }))).toMatchObject({ code: 'CONFIG', message: expect.stringContaining('it has no `input`. fix: add `"input": "openapi.yaml"`, the spec to generate from') as unknown });
    const empty = realpathSync(scratch('apicontract-none-'));
    expect(await failure(requireConfig(empty, undefined))).toMatchObject({
      code: 'CONFIG',
      message: `${join(empty, 'apicontract.config.json')} cannot be used:\n  - no config was found. fix: create apicontract.config.json with \`input\` and \`targets\`, or pass \`--config\``,
    });
  });

  it('refuses a generator the plugins do not provide, listing the ones they do', async () => {
    const root = project({ targets: { types: { generator: 'nope', out: 'o' } } });
    expect((await failure(gen({ cwd: root }))).message).toContain('no generator is named "nope". fix: use one of: types');
  });

  it('refuses a map that was edited into something unreadable', async () => {
    const root = project();
    writeFileSync(join(root, 'apicontract.map.json'), '{');
    expect(await failure(gen({ cwd: root }))).toMatchObject({ code: 'CONFIG' });
  });
});

describe('apicontract gen, through burgee', () => {
  beforeAll(async () => {
    await runBurgee(program, { argv: ['--version'] });
  });

  it('answers --json --dry-run with the envelope, and writes nothing', async () => {
    const root = project();
    const r = await runBurgee(program, { argv: ['gen', '--json', '--dry-run', '--config', join(root, 'apicontract.config.json')] });
    expect(r.stderr).toBe('');
    expect(r.code).toBe(ExitCode.OK);
    const envelope = r.json as { ok: boolean; data: { changes: number; diff: string; files: unknown[] }; meta: Record<string, unknown> };
    expect(Object.keys(envelope).toSorted()).toEqual(['data', 'meta', 'ok']);
    expect(envelope.ok).toBe(true);
    expect(envelope.data.changes).toBe(4);
    expect(envelope.data.diff).toContain('+++ b/src/gen/types.ts');
    expect(typeof envelope.meta).toBe('object');
    expect(existsSync(join(root, 'src/gen'))).toBe(false);
  });

  it('exits 1 on --check when stale and 0 after gen, and 1 with the fix line on a hand edit', async () => {
    const root = project();
    const config = join(root, 'apicontract.config.json');
    expect((await runBurgee(program, { argv: ['gen', '--check', '--json', '--config', config] })).code).toBe(ExitCode.RUNTIME);
    expect((await runBurgee(program, { argv: ['gen', '--target', 'types', '--config', config] })).code).toBe(ExitCode.OK);
    expect((await runBurgee(program, { argv: ['gen', '--check', '--config', config] })).code).toBe(ExitCode.OK);
    writeFileSync(join(root, 'src/gen/types.ts'), `${read(root, 'src/gen/types.ts')}// mine\n`);
    const edited = await runBurgee(program, { argv: ['gen', '--config', config] });
    expect(edited.code).toBe(ExitCode.RUNTIME);
    expect(edited.stderr).toContain('fix: move the change to a user file, or pass --force');
    expect((await runBurgee(program, { argv: ['gen', '--force', '--config', config] })).code).toBe(ExitCode.OK);
  });

  it('exits 3 on a config it cannot use, and 2 on an unknown target', async () => {
    const root = project({ inptu: 'x' });
    expect((await runBurgee(program, { argv: ['gen', '--config', join(root, 'apicontract.config.json')] })).code).toBe(ExitCode.CONFIG);
    const good = project();
    expect((await runBurgee(program, { argv: ['gen', '--target', 'nope', '--config', join(good, 'apicontract.config.json')] })).code).toBe(ExitCode.USAGE);
  });

  it('finds the config in the working folder when --config is not given', async () => {
    const root = project();
    vi.spyOn(process, 'cwd').mockReturnValue(root);
    const r = await runBurgee(program, { argv: ['gen', '--json'] });
    expect(r.code).toBe(ExitCode.OK);
    expect(existsSync(join(root, 'src/gen/types.ts'))).toBe(true);
  });
});
