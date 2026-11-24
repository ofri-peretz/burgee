import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { Anonymous, Legacy, Plain, Throws } from './__fixtures__/extract/foreign-schemas.js';
import { Owner as TruefitOwner } from './__fixtures__/extract/truefit-schemas.js';
import { Length, Owner, Pet, Tree } from './__fixtures__/extract/zod-schemas.js';
import { checkPlugin, createHost, validate } from './host.js';
import { DIALECT, exportsOf, extractSchemas, plugin } from './plugin-extract-standard-schema.js';
import { builtins } from './plugins.js';

const fixture = (name: string): string => fileURLToPath(new URL(`__fixtures__/extract/${name}`, import.meta.url));

const extractor = createHost();
extractor.register(plugin);
/** What the extractor returns: the document, and its findings beside it. */
const result = async (options: Record<string, unknown>): Promise<{ document: unknown; findings: unknown[] }> =>
  (await extractor.extractor('standard-schema').run(options)) as { document: unknown; findings: unknown[] };
const run = async (options: Record<string, unknown>): Promise<unknown> => (await result(options)).document;

describe('the standard-schema extractor', () => {
  it('is a built-in plugin the host accepts, whose sample is what it returns', async () => {
    expect(() => validate(plugin)).not.toThrow();
    expect(builtins).toContain(plugin);
    expect(plugin.name).toBe('extract-standard-schema');
    expect(await checkPlugin(plugin)).toEqual([]);
    expect(plugin.extractors?.['standard-schema']?.options).toEqual({
      module: { type: 'string', description: 'the module to import, relative to the working folder; its code runs' },
      export: { type: 'string', description: 'the export to read, or "*" for every schema it exports (default)' },
      side: { type: 'string', description: '"input" (default): what parse reads; "output": what it hands out' },
    });
    expect(DIALECT).toBe('https://json-schema.org/draft/2020-12/schema');
  });

  it('reads Zod 4 schemas from a module path, by Standard JSON Schema alone', async () => {
    const { document: read, findings } = await result({ module: fixture('zod-schemas.ts') });
    const document = read as { $schema: string; $defs: Record<string, unknown> };
    expect(document.$schema).toBe(DIALECT);
    expect(Object.keys(document.$defs)).toEqual(['Length', 'PetRecord', 'Owner', 'Pet', 'Tree']);
    expect(document.$defs.Pet).toEqual({ $ref: '#/$defs/PetRecord' });
    expect(document.$defs.PetRecord).toEqual({
      type: 'object',
      properties: { id: { type: 'integer', minimum: -9_007_199_254_740_991, maximum: 9_007_199_254_740_991 }, name: { type: 'string', minLength: 1, description: 'what the pet answers to' }, tag: { type: 'string' } },
      required: ['id', 'name'],
    });
    expect(document.$defs.Owner).toMatchObject({ properties: { pets: { type: 'array', items: { $ref: '#/$defs/PetRecord' } }, email: { type: 'string', format: 'email' } } });
    expect(document.$defs.Tree).toMatchObject({ properties: { children: { items: { $ref: '#/$defs/Tree' } } } });
    expect(findings).toEqual([]);
    expect(document).not.toHaveProperty('x-findings');
  });

  it('reads the validator\'s schemas the same way', async () => {
    expect(await run({ module: fixture('validator-schemas.ts') })).toEqual({
      $schema: DIALECT,
      $defs: {
        Owner: { type: 'object', properties: { pets: { type: 'array', items: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] } }, email: { type: 'string' } }, required: ['pets', 'email'] },
        Pet: { type: 'object', properties: { id: { type: 'number' }, name: { type: 'string' }, tag: { type: 'string' } }, required: ['id', 'name'] },
      },
    });
  });

  it('reads truefit\'s plain schemas, and those wrapped by truefit/standard, from a module path', async () => {
    const pet = { type: 'object', properties: { id: { type: 'number' }, name: { type: 'string' }, tag: { type: 'string' } }, required: ['id', 'name'] };
    const expected = { $schema: DIALECT, $defs: { Owner: { type: 'object', properties: { email: { type: 'string' } }, required: ['email'] }, Pet: pet } };
    expect(await result({ module: fixture('truefit-schemas.ts') })).toEqual({ document: expected, findings: [] });
    expect(await result({ module: { Owner: TruefitOwner, version: 1 }, export: 'Owner' })).toEqual({ document: { $schema: DIALECT, $defs: { Owner: expected.$defs.Owner } }, findings: [] });
  });

  it('says so when a module exports no schema it reads, instead of an empty document alone', async () => {
    expect(await result({ module: { Plain, version: 1 } })).toEqual({
      document: { $schema: DIALECT, $defs: {} },
      findings: [
        {
          code: 'no-schemas',
          pointer: '',
          message: 'the module exports no schema this extractor reads (its exports: Plain, version)',
          fix: 'export schemas of a Standard Schema library (Zod 4, Valibot, ArkType) or truefit, or name the export to read with `"export"`',
        },
      ],
    });
    expect(((await result({ module: {} })).findings[0] as { message: string }).message).toBe('the module exports no schema this extractor reads');
  });

  it('reads one export by name, and the output side when asked, where a transform is a finding', async () => {
    expect(await run({ module: { Length }, export: 'Length' })).toEqual({ $schema: DIALECT, $defs: { Length: { type: 'string' } } });
    expect(await result({ module: { Length }, export: 'Length', side: 'output' })).toEqual({
      document: { $schema: DIALECT, $defs: {} },
      findings: [{ code: 'not-representable', pointer: '/Length', message: 'zod cannot write the output of /Length as JSON Schema: Transforms cannot be represented in JSON Schema', fix: 'extract with `"side": "input"`, or describe the output with a schema of its own' }],
    });
  });

  it('reports every schema it cannot read, by library, and keeps the rest', async () => {
    const { document, findings } = await result({ module: { Anonymous, Legacy, Throws, Plain, Ok: Length } });
    expect(document).toEqual({ $schema: DIALECT, $defs: { Ok: { type: 'string' } } });
    expect((findings as { pointer: string; code: string }[]).map((found) => `${found.pointer} ${found.code}`)).toEqual([
      '/Anonymous no-standard-json-schema',
      '/Legacy no-standard-json-schema',
      '/Throws not-representable',
    ]);
  });

  it('reports a named export that is not a schema', async () => {
    expect(await result({ module: { Plain }, export: 'Plain' })).toMatchObject({ document: { $defs: {} }, findings: [{ code: 'not-a-standard-schema', pointer: '/Plain' }] });
  });

  it('refuses an export the module does not have, naming the ones it has', async () => {
    await expect(run({ module: { b: 1, a: 2 }, export: 'Missing' })).rejects.toThrow('the module has no export "Missing". fix: name one of a, b, or write "*"');
    await expect(run({ module: {}, export: 3 })).rejects.toThrow('the module has no export 3. fix: name one of its exports, or write "*"');
  });

  it('refuses an unknown side', async () => {
    await expect(run({ module: {}, side: 'both' })).rejects.toThrow('fix: write "input" or "output"');
  });
});

describe('exportsOf', () => {
  it('is every schema export, sorted, for * or nothing', () => {
    const namespace = { b: Pet, a: Tree, c: 1 };
    expect(exportsOf(namespace, '*')).toEqual(['a', 'b']);
    expect(exportsOf(namespace, undefined)).toEqual(['a', 'b']);
    expect(exportsOf(namespace, 'c')).toEqual(['c']);
  });

  it('does not find an inherited name', () => {
    expect(() => exportsOf({}, 'toString')).toThrow('the module has no export "toString"');
  });
});

describe('extractSchemas', () => {
  it('keeps the definitions a schema carries beside the exports', () => {
    expect(extractSchemas({ Owner: Owner }, {}).document).toMatchObject({ $defs: { Owner: { properties: { pets: { items: { $ref: '#/$defs/PetRecord' } } } }, PetRecord: { type: 'object' } } });
  });
});
