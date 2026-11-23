import { copyFileSync, existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ExitCode } from 'burgee';
import { runBurgee } from 'burgee/testing';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { scratchDirs } from './__fixtures__/run/scratch-dir.js';
import { program } from './cli.js';
import { extract } from './run-extract.js';


const scratch = scratchDirs();
const PLUGIN = fileURLToPath(new URL('__fixtures__/run/plugin.mjs', import.meta.url));
const temp = (): string => realpathSync(scratch('apicontract-extract-'));

/** A project whose config loads the spine's test plugin. */
const project = (extractConfig?: Record<string, unknown>): string => {
  const root = temp();
  copyFileSync(PLUGIN, join(root, 'plugin.mjs'));
  writeFileSync(join(root, 'contractdiff.config.json'), JSON.stringify({ plugins: ['./plugin.mjs'], ...(extractConfig === undefined ? {} : { extract: extractConfig }) }));
  return root;
};

const spec = (title: string): string => `${JSON.stringify({ openapi: '3.1.0', info: { title, version: '1' }, paths: {} }, undefined, 2)}\n`;

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

describe('extract', () => {
  it('writes the spec an extractor returns to spec.json, records it, and a second run changes nothing', async () => {
    const root = project();
    const first = await extract({ cwd: root, from: 'schemas' });
    expect(first.findings).toEqual([]);
    expect(first.files).toEqual([
      { path: 'spec.json', owner: 'generated', action: 'write', target: 'extract' },
      { path: 'contractdiff.map.json', owner: 'generated', action: 'write' },
    ]);
    expect(readFileSync(join(root, 'spec.json'), 'utf8')).toBe(spec('extracted'));
    const map = JSON.parse(readFileSync(join(root, 'contractdiff.map.json'), 'utf8')) as { files: Record<string, { target: string }> };
    expect(map.files['spec.json']?.target).toBe('extract');
    expect((await extract({ cwd: root, from: 'schemas' })).changed).toBe(false);
  });

  it('takes the extractor, the file and the options from the config, and the flags over them', async () => {
    const root = project({ from: 'schemas', out: 'api/openapi.json', options: { title: 'Configured' } });
    await extract({ cwd: root });
    expect(readFileSync(join(root, 'api/openapi.json'), 'utf8')).toBe(spec('Configured'));
    await extract({ cwd: root, out: './other.json', check: false, dryRun: false, force: false });
    expect(existsSync(join(root, 'other.json'))).toBe(true);
  });

  it('refuses to overwrite a spec edited by hand, unless forced; and checks and diffs without writing', async () => {
    const root = project();
    await extract({ cwd: root, from: 'schemas' });
    writeFileSync(join(root, 'spec.json'), '{ "mine": true }\n');
    expect((await failure(extract({ cwd: root, from: 'schemas' }))).message).toBe('generated files were edited by hand: spec.json. fix: move the change to a user file, or pass --force');
    await extract({ cwd: root, from: 'schemas', force: true });
    writeFileSync(join(root, 'contractdiff.config.json'), JSON.stringify({ plugins: ['./plugin.mjs'], extract: { options: { title: 'New' } } }));
    expect(await extract({ cwd: root, from: 'schemas', check: true })).toMatchObject({ stale: ['spec.json', 'contractdiff.map.json'], exitCode: 1, fix: 'run `contractdiff extract` and commit the result' });
    expect((await extract({ cwd: root, from: 'schemas', dryRun: true })).diff).toContain('+    "title": "New",');
    expect(readFileSync(join(root, 'spec.json'), 'utf8')).toBe(spec('extracted'));
  });

  it('runs without a config, with only the built-in extractors', async () => {
    const root = temp();
    expect((await failure(extract({ cwd: root, from: 'schemas' }))).message).toContain('no extractor is named "schemas"');
  });

  it.each([
    [undefined, undefined, 'extract needs an extractor. fix: pass --from <extractor>, or set `"extract": { "from": "…" }` in the config'],
    ['schemas', '../spec.json', '--out must be a .json file inside the project. fix: pass --out spec.json'],
    ['schemas', 'spec.yaml', '--out must be a .json file inside the project. fix: pass --out spec.json'],
  ])('refuses --from %j --out %j as a usage error', async (from, out, message) => {
    const error = await failure(extract({ cwd: project(), ...(from === undefined ? {} : { from }), ...(out === undefined ? {} : { out }) }));
    expect(error).toMatchObject({ code: 'USAGE', message });
  });

  it('reports the findings an extractor returns beside the document, and keeps them out of the spec', async () => {
    const root = project({ options: { findings: true } });
    const report = await extract({ cwd: root, from: 'schemas' });
    expect(report.findings).toEqual([{ code: 'type-only', pointer: '/health', message: 'health has no schema', fix: 'give it one', target: 'extract' }]);
    expect(readFileSync(join(root, 'spec.json'), 'utf8')).toBe(spec('extracted'));
  });

  it('refuses an extractor that returns no document', async () => {
    const root = project({ options: { empty: true } });
    expect((await failure(extract({ cwd: root, from: 'schemas' }))).message).toBe('the extractor "schemas" returned no document. fix: return the spec object from `run(options)`');
  });
});

describe('contractdiff extract, through burgee', () => {
  beforeAll(async () => {
    await runBurgee(program, { argv: ['--version'] });
  });

  it('answers --json --dry-run with the envelope', async () => {
    const root = project();
    const r = await runBurgee(program, { argv: ['extract', '--json', '--dry-run', '--from', 'schemas', '--out', 'x.json', '--config', join(root, 'contractdiff.config.json')] });
    expect(r.code).toBe(ExitCode.OK);
    expect(r.json).toMatchObject({ ok: true, data: { changed: true, changes: 2 } });
    expect(existsSync(join(root, 'x.json'))).toBe(false);
  });

  it('reports the findings in the --json envelope and in the text', async () => {
    const config = join(project({ options: { findings: true } }), 'contractdiff.config.json');
    const json = await runBurgee(program, { argv: ['extract', '--json', '--dry-run', '--from', 'schemas', '--config', config] });
    expect(json.json).toMatchObject({ ok: true, data: { findings: [{ code: 'type-only', pointer: '/health', target: 'extract' }] } });
    const text = await runBurgee(program, { argv: ['extract', '--dry-run', '--from', 'schemas', '--config', config] });
    expect(text.stdout).toContain('health has no schema');
  });

  it('writes with the working folder as the project when --config is not given, and flags pass through', async () => {
    const root = project();
    vi.spyOn(process, 'cwd').mockReturnValue(root);
    expect((await runBurgee(program, { argv: ['extract', '--from', 'schemas', '--check'] })).code).toBe(ExitCode.RUNTIME);
    expect((await runBurgee(program, { argv: ['extract', '--from', 'schemas', '--force'] })).code).toBe(ExitCode.OK);
    expect(existsSync(join(root, 'spec.json'))).toBe(true);
    expect((await runBurgee(program, { argv: ['extract', '--json'] })).code).toBe(ExitCode.USAGE);
  });
});
