import { fileURLToPath } from 'node:url';

import { number, object, string } from 'truefit';
import { standardJson } from 'truefit/json-schema';
import { standard as truefitStandard } from 'truefit/standard';
import { describe, expect, it } from 'vitest';

import { asStandard, definitions, escape, isStandard, type Json, loadModule, placeAt, relocate, sideOf, toJsonSchema } from './extract-standard.js';

const FIXTURE = fileURLToPath(new URL('__fixtures__/extract/validator-schemas.ts', import.meta.url));

const standard = (jsonSchema: unknown, vendor?: string): Json => ({ '~standard': { version: 1, validate: () => ({ value: 1 }), ...(vendor === undefined ? {} : { vendor }), jsonSchema } });

describe('isStandard', () => {
  it('is a value with a ~standard object, whether the value is an object or a function', () => {
    expect(isStandard(standard({}))).toBe(true);
    expect(isStandard(Object.assign(() => 1, { '~standard': {} }))).toBe(true);
    expect(isStandard({ '~standard': 1 })).toBe(false);
    expect(isStandard({ '~standard': [] })).toBe(false);
    expect(isStandard(null)).toBe(false);
    expect(isStandard('~standard')).toBe(false);
    expect(isStandard({})).toBe(false);
  });
});

describe('asStandard', () => {
  const Pet = object({ id: number(), name: string() });
  const written = { type: 'object', properties: { id: { type: 'number' }, name: { type: 'string' } }, required: ['id', 'name'] };

  it('makes a plain truefit schema Standard JSON Schema', () => {
    expect(isStandard(Pet)).toBe(false);
    expect(toJsonSchema(asStandard(Pet), 'input', '/Pet')).toEqual({ schema: written });
    // toJsonSchema does it itself.
    expect(toJsonSchema(Pet, 'input', '/Pet')).toEqual({ schema: written });
  });

  it('adds Standard JSON Schema to truefit/standard\'s wrapper, keeping its validate', () => {
    const wrapped = truefitStandard(Pet);
    const made = asStandard(wrapped) as { '~standard': { validate: unknown; jsonSchema: unknown } };
    expect(made['~standard'].validate).toBe(wrapped['~standard'].validate);
    expect(toJsonSchema(wrapped, 'input', '/Pet')).toEqual({ schema: written });
  });

  it('leaves alone a truefit schema that already converts, another library\'s schema, and what is not a schema', () => {
    const converts = standardJson(Pet);
    expect(asStandard(converts)).toBe(converts);
    const foreign = { kind: 'object', check: () => true, '~standard': { version: 1, vendor: 'other', validate: () => ({ value: 1 }) } };
    expect(asStandard(foreign)).toBe(foreign);
    for (const value of [undefined, 1, { kind: 'object' }, { check: () => true }, { kind: 1, check: () => true }, standard({})]) expect(asStandard(value)).toBe(value);
  });
});

describe('escape', () => {
  it('escapes ~ before /, as JSON Pointer says', () => {
    expect(escape('a/b~c')).toBe('a~1b~0c');
  });
});

describe('loadModule', () => {
  it('imports a path, and takes an object as the module itself', async () => {
    const module = await loadModule(FIXTURE);
    expect(Object.keys(module).toSorted()).toEqual(['Owner', 'Pet']);
    const given = { a: 1 };
    expect(await loadModule(given)).toBe(given);
  });

  it('reads a .json module as data, as its default export, without importing it', async () => {
    const path = fileURLToPath(new URL('__fixtures__/extract/data.json', import.meta.url));
    expect(await loadModule(path)).toEqual({ default: { type: 'string' } });
  });

  it('refuses no module, an empty name, or a value that is neither, with a fix', async () => {
    const refused = await Promise.allSettled([undefined, '', 3, []].map(async (module) => loadModule(module)));
    expect(refused.map((result) => (result.status === 'rejected' ? String(result.reason) : 'loaded'))).toEqual(Array.from({ length: 4 }, () => 'TypeError: the `module` option names no module. fix: set `"options": { "module": "./src/schemas.ts" }`'));
  });
});

describe('sideOf', () => {
  it('is input by default, and output when asked', () => {
    expect(sideOf(undefined)).toBe('input');
    expect(sideOf('input')).toBe('input');
    expect(sideOf('output')).toBe('output');
  });

  it('refuses anything else, with a fix', () => {
    expect(() => sideOf('both')).toThrow('the `side` option is "both". fix: write "input" or "output"');
  });
});

describe('toJsonSchema', () => {
  it('asks the converter for the side, in draft 2020-12, and drops its $schema', () => {
    const asked: unknown[] = [];
    const value = standard({ input: (options: unknown) => (asked.push(['input', options]), { $schema: 'x', type: 'string' }), output: (options: unknown) => (asked.push(['output', options]), { type: 'number' }) });
    expect(toJsonSchema(value, 'input', '/A')).toEqual({ schema: { type: 'string' } });
    expect(toJsonSchema(value, 'output', '/A')).toEqual({ schema: { type: 'number' } });
    expect(asked).toEqual([
      ['input', { target: 'draft-2020-12' }],
      ['output', { target: 'draft-2020-12' }],
    ]);
  });

  it('reports a value that is not a Standard Schema', () => {
    expect(toJsonSchema({ type: 'string' }, 'input', '/A')).toEqual({
      finding: { code: 'not-a-standard-schema', pointer: '/A', message: '/A is not a Standard Schema: it has no `~standard`', fix: 'export a schema of a Standard Schema library (Zod 4, Valibot, ArkType, truefit), or leave it out of the extract' },
    });
  });

  it('names the library of a Standard Schema without Standard JSON Schema', () => {
    expect(toJsonSchema(standard(undefined, 'zod'), 'input', '/A')).toEqual({
      finding: {
        code: 'no-standard-json-schema',
        pointer: '/A',
        message: '/A is a schema of zod, which does not implement Standard JSON Schema (`~standard.jsonSchema.input`)',
        fix: 'upgrade zod to a version that implements Standard JSON Schema (Zod 4.2+), or export the schema from a library that does',
      },
    });
  });

  it('says so when the library does not name itself, or lacks only the side asked for', () => {
    const result = toJsonSchema(standard({ input: () => ({}) }), 'output', '/B');
    expect(result).toMatchObject({ finding: { message: '/B is a schema of an unnamed library, which does not implement Standard JSON Schema (`~standard.jsonSchema.output`)' } });
    expect(toJsonSchema(standard({ output: 1 }, 7 as unknown as string), 'output', '/B')).toMatchObject({ finding: { code: 'no-standard-json-schema' } });
  });

  it('reports a converter that throws, with its message, and a fix for the side', () => {
    const throws = standard({
      input: () => {
        throw new Error('Date cannot be represented');
      },
      output: () => {
        throw 'nope';
      },
    }, 'lib');
    expect(toJsonSchema(throws, 'input', '/A')).toEqual({
      finding: { code: 'not-representable', pointer: '/A', message: 'lib cannot write the input of /A as JSON Schema: Date cannot be represented', fix: 'replace the part JSON Schema cannot hold (a transform, a date, a custom check) with one it can' },
    });
    expect(toJsonSchema(throws, 'output', '/A')).toEqual({
      finding: { code: 'not-representable', pointer: '/A', message: 'lib cannot write the output of /A as JSON Schema: nope', fix: 'extract with `"side": "input"`, or describe the output with a schema of its own' },
    });
  });
});

describe('relocate', () => {
  it('moves the $defs out, and points # and #/$defs/… at their new homes', () => {
    const place = placeAt('#/components/schemas/');
    const schema = { type: 'object', properties: { self: { $ref: '#' }, pet: { $ref: '#/$defs/Pet' }, id: { $ref: '#/$defs/Pet/properties/id' }, far: { $ref: 'other.json' } }, $defs: { Pet: { type: 'object', properties: { owner: { $ref: '#' } } } } };
    expect(relocate(schema, 'Owner', place)).toEqual({
      type: 'object',
      properties: { self: { $ref: '#/components/schemas/Owner' }, pet: { $ref: '#/components/schemas/Pet' }, id: { $ref: '#/components/schemas/Pet/properties/id' }, far: { $ref: 'other.json' } },
    });
    expect(definitions(place)).toEqual({ Pet: { type: 'object', properties: { owner: { $ref: '#/components/schemas/Owner' } } } });
    expect(place.findings).toEqual([]);
  });

  it('shares a definition two schemas both carry, unchanged', () => {
    const place = placeAt('#/$defs/');
    place.defs.set('Pet', { type: 'string' });
    expect(relocate({ $ref: '#/$defs/Pet', $defs: { Pet: { type: 'string' } } }, 'A', place)).toEqual({ $ref: '#/$defs/Pet' });
    expect(definitions(place)).toEqual({ Pet: { type: 'string' } });
    expect(place.findings).toEqual([]);
  });

  it('renames a definition that clashes with another, and says so', () => {
    const place = placeAt('#/$defs/');
    place.defs.set('Pet', { type: 'string' });
    const moved = relocate({ items: [{ $ref: '#/$defs/Pet' }], $defs: { Pet: { type: 'number' } } }, 'A/b', place);
    expect(moved).toEqual({ items: [{ $ref: '#/$defs/A~1b.Pet' }] });
    expect(definitions(place)).toEqual({ Pet: { type: 'string' }, 'A/b.Pet': { type: 'number' } });
    expect(place.findings).toEqual([
      { code: 'renamed-definition', pointer: '/$defs/A~1b', message: 'two schemas define "Pet" differently; the one A/b uses is kept as "A/b.Pet"', fix: 'give one of them another id' },
    ]);
  });

  it('compares a clashing definition as it reads once moved: its own # is the schema moved', () => {
    const place = placeAt('#/$defs/');
    place.defs.set('Node', { items: { $ref: '#/$defs/A' } });
    relocate({ $defs: { Node: { items: { $ref: '#' } } } }, 'A', place);
    expect(place.findings).toEqual([]);
  });

  it('rewrites only $ref: a value that looks like a reference elsewhere is data', () => {
    expect(relocate({ const: '#', description: '#/$defs/A', $defs: { A: {} } }, 'X', placeAt('#/components/schemas/'))).toEqual({ const: '#', description: '#/$defs/A' });
  });

  it('decodes an escaped definition name in a reference, and escapes it again', () => {
    const place = placeAt('#/$defs/');
    expect(relocate({ $ref: '#/$defs/a~1b~0c', $defs: { 'a/b~c': { type: 'null' } } }, 'X', place)).toEqual({ $ref: '#/$defs/a~1b~0c' });
    expect(definitions(place)).toEqual({ 'a/b~c': { type: 'null' } });
  });

  it('leaves a schema without $defs as it is, ignores a $defs that is not an object, and keeps a name it does not carry', () => {
    const place = placeAt('#/components/schemas/');
    expect(relocate({ type: 'string', $defs: 1 }, 'X', place)).toEqual({ type: 'string' });
    expect(relocate({ $ref: 7 }, 'X', place)).toEqual({ $ref: 7 });
    expect(relocate({ $ref: '#/$defs/Gone' }, 'X', place)).toEqual({ $ref: '#/components/schemas/Gone' });
    expect(definitions(place)).toEqual({});
  });
});
