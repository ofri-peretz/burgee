/**
 * apicontract-lint R7: `plugin new --kind rules --from <finding.json>` seeds a rule from one finding.
 */
import { writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/kit/scratch-dir.js';
import { seedOf } from './scaffold-seed.js';
import { scaffold } from './scaffold.js';
import { conformance } from './testing.js';

const document = {
  openapi: '3.1.0',
  info: { title: 't', version: '1' },
  paths: { '/pets/{id}': { get: { operationId: 'getPet', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }, { name: 'fields', in: 'query', schema: { type: 'string' } }], responses: { 200: { description: 'ok' } } } } },
};
const PARAMETER = { rule: 'parameter-description', file: 'api.json', pointer: '#/paths/~1pets~1{id}/get/parameters/0', message: 'id: `description` is missing', fix: 'add a `description`' };

const dir = scratchDirs()('apicontract-seed-');
writeFileSync(join(dir, 'api.json'), JSON.stringify(document));
const write = (name: string, value: unknown): string => {
  writeFileSync(join(dir, name), typeof value === 'string' ? value : JSON.stringify(value));
  return name;
};

describe('seedOf', () => {
  it('reads the finding, finds the kind of node at its pointer, and leaves a named node’s name to the engine', () => {
    const seed = seedOf(write('parameter.json', PARAMETER), dir);
    expect(seed).toEqual({
      document,
      select: 'parameter',
      pointer: PARAMETER.pointer,
      message: '`description` is missing',
      fix: 'add a `description`',
      findings: [{ pointer: PARAMETER.pointer, message: 'id: `description` is missing' }],
    });
  });

  it('takes the first finding of a whole lint run, and gives a fix of its own when the finding has none', () => {
    const run = { findings: [{ file: 'api.json', pointer: '#', message: '`info.description` is missing' }, PARAMETER] };
    expect(seedOf(write('run.json', run), dir)).toMatchObject({ select: 'document', message: '`info.description` is missing', fix: 'say what to change so the node is no longer this mistake' });
  });

  it('keeps a message that does not start with the node’s name', () => {
    expect(seedOf(write('bare.json', { ...PARAMETER, message: 'missing' }), dir)).toMatchObject({ message: 'missing', findings: [{ message: 'id: missing' }] });
  });

  it('reads the finding’s file from the folder it is run in', () => {
    const elsewhere = join(dir, 'sub');
    expect(seedOf(join(relative(elsewhere, dir), write('relative.json', { ...PARAMETER, file: join('..', 'api.json') })), elsewhere).select).toBe('parameter');
  });

  it.each<[string, unknown, string]>([
    ['not JSON', '{', 'bad.json is not JSON: '],
    ['null', 'null', 'bad.json holds no finding with a `file`, a `pointer` and a `message`.'],
    ['not a finding', [], 'bad.json holds no finding with a `file`, a `pointer` and a `message`.'],
    ['an empty run', { findings: [] }, 'bad.json holds no finding with a `file`, a `pointer` and a `message`.'],
    ['a finding with no file', { pointer: '#', message: 'm' }, 'bad.json holds no finding'],
    ['a finding with no pointer', { file: 'api.json', message: 'm' }, 'bad.json holds no finding'],
    ['a finding with no message', { file: 'api.json', pointer: '#' }, 'bad.json holds no finding'],
  ])('refuses a file that is %s, with the shape it takes', (_, value, start) => {
    write('bad.json', value);
    expect(() => seedOf('bad.json', dir)).toThrow(start);
    expect(() => seedOf('bad.json', dir)).toThrow(/fix: pass one finding from `apicontract lint --json`, shaped \{ "file", "pointer", "message", "fix" \}, or the whole output$/u);
  });

  it('refuses a finding file that is not there, and a pointer no rule can select', () => {
    expect(() => seedOf('missing.json', dir)).toThrow('there is no finding file missing.json. fix: save one with `apicontract lint <spec> --json > missing.json`');
    expect(() => seedOf(write('nowhere.json', { ...PARAMETER, pointer: '#/nowhere' }), dir)).toThrow('api.json has no node at #/nowhere a rule can select. fix: lint api.json again and pass a finding from that run');
  });
});

describe('a seeded rules plugin', () => {
  it('passes the conformance suite as written', async () => {
    const testing = pathToFileURL(join(import.meta.dirname, 'testing.ts')).href;
    const [source] = scaffold('no-bare-ids', 'rules', seedOf(write('seed.json', PARAMETER), dir));
    expect(source?.content).toContain('description: "Never again: `description` is missing",');
    writeFileSync(join(dir, 'plugin-no-bare-ids.ts'), (source?.content ?? '').replaceAll("'apicontract/testing'", `'${testing}'`));
    // eslint-disable-next-line node-security/no-dynamic-dependency-loading -- the scaffold as written to disk, loaded as a user would load it
    const module = (await import(pathToFileURL(join(dir, 'plugin-no-bare-ids.ts')).href)) as { plugin: unknown };
    await expect(conformance(module.plugin)).resolves.toBeUndefined();
  });
});
