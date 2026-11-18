import { readdirSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { inline } from './core/resolve.js';

import { adapter, detect, JsonSchemaError, read } from './input-jsonschema.js';

const FIXTURES = new URL('__fixtures__/inputs/jsonschema/', import.meta.url);

interface Case {
  readonly description: string;
  readonly schema: unknown;
}

/** Every schema in the JSON-Schema-Test-Suite files under the fixture folder, one document each. */
const cases: { file: string; description: string; schema: unknown }[] = readdirSync(FIXTURES)
  .filter((file) => file.endsWith('.json'))
  .toSorted()
  .flatMap((file) =>
    (JSON.parse(readFileSync(new URL(file, FIXTURES), 'utf8')) as { tests: Case[] }).tests.map(({ description, schema }) => ({ file, description, schema })),
  );

describe('detect', () => {
  it('recognises a schema by its top-level keywords', () => {
    for (const schema of [
      { $schema: 'https://json-schema.org/draft/2020-12/schema' },
      { $id: 'https://example.com/a' },
      { $ref: '#/$defs/a' },
      { $defs: {} },
      { definitions: {} },
      { properties: {} },
      { type: 'object' },
      { type: ['string', 'null'] },
      { type: 'integer' },
    ]) {
      expect(detect(schema)).toBe(true);
    }
  });

  it('declines anything else, and never throws', () => {
    for (const other of [
      {},
      { type: 'Feature' },
      { type: [] },
      { type: ['string', 'Feature'] },
      { type: 7 },
      { $schema: 7, $id: 7, $ref: 7, $defs: [], definitions: 'a', properties: [] },
      [],
      null,
      true,
      'type: object',
    ]) {
      expect(detect(other)).toBe(false);
    }
  });
});

describe('read', () => {
  it('reads the root as one operation and each definition as another, schemas as written', () => {
    const tree = { type: 'object' };
    const document = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      $defs: { 'a/b': { $ref: '#/definitions/tree' }, never: false },
      definitions: { tree },
    };
    const contract = read(document);
    expect(contract.format).toBe('jsonschema');
    expect(contract.document).toBe(document);
    expect(contract.findings).toEqual([]);
    expect(contract.operations).toEqual([
      { id: 'schema', source: '#', payloads: [{ name: 'value', direction: 'request', schema: document, required: true }] },
      { id: 'a/b', source: '#/$defs/a~1b', payloads: [{ name: 'value', direction: 'request', schema: { $ref: '#/definitions/tree' }, required: true }] },
      { id: 'never', source: '#/$defs/never', payloads: [{ name: 'value', direction: 'request', schema: false, required: true }] },
      { id: 'tree', source: '#/definitions/tree', payloads: [{ name: 'value', direction: 'request', schema: tree, required: true }] },
    ]);
  });

  it("names the root by its `$id`, draft-04's `id`, its `title`, or `schema`", () => {
    const id = (document: object): string | undefined => read(document).operations[0]?.id;
    expect(id({ $id: 'https://example.com/a', id: 'b', title: 'c' })).toBe('https://example.com/a');
    expect(id({ $id: 1, id: 'b', title: 'c' })).toBe('b');
    expect(id({ id: 1, title: 'c' })).toBe('c');
    expect(id({ title: 1 })).toBe('schema');
  });

  it('reads a boolean schema', () => {
    expect(read(true)).toEqual({
      format: 'jsonschema',
      document: true,
      operations: [{ id: 'schema', source: '#', payloads: [{ name: 'value', direction: 'request', schema: true, required: true }] }],
      findings: [],
    });
  });

  it('refuses a document that is not a schema, with a fix', () => {
    for (const other of [[], null, 'a', 1]) {
      expect(() => read(other)).toThrow(
        new JsonSchemaError('a schema is an object or a boolean', 'pass the parsed schema document, not a list or a value'),
      );
    }
    expect(new JsonSchemaError('r', 'f')).toMatchObject({ name: 'JsonSchemaError', message: 'not a JSON Schema: r. fix: f' });
  });

  it('renames a definition whose name is taken, and says so', () => {
    const contract = read({ title: 'Pet', $defs: { Pet: {}, Tag: {} }, definitions: { Tag: {} } });
    expect(contract.operations.map(({ id, source }) => [id, source])).toEqual([
      ['Pet', '#'],
      ['$defs/Pet', '#/$defs/Pet'],
      ['Tag', '#/$defs/Tag'],
      ['definitions/Tag', '#/definitions/Tag'],
    ]);
    expect(contract.findings).toEqual([
      {
        code: 'id-collision',
        pointer: '#/$defs/Pet',
        message: 'another operation is already named `Pet`, so this one is `$defs/Pet`',
        fix: 'give the definitions, and the root `$id` or `title`, distinct names',
      },
      {
        code: 'id-collision',
        pointer: '#/definitions/Tag',
        message: 'another operation is already named `Tag`, so this one is `definitions/Tag`',
        fix: 'give the definitions, and the root `$id` or `title`, distinct names',
      },
    ]);
  });

  it('skips a definition that is not a schema, with a finding', () => {
    const contract = read({ definitions: { count: 3, list: [] }, $defs: 'not a group' });
    expect(contract.operations.map(({ id }) => id)).toEqual(['schema']);
    expect(contract.findings).toEqual([
      {
        code: 'not-a-schema',
        pointer: '#/definitions/count',
        message: '`definitions.count` is neither an object nor a boolean, so it is not read as an operation',
        fix: 'make it a schema, or move it out of `definitions`',
      },
      {
        code: 'not-a-schema',
        pointer: '#/definitions/list',
        message: '`definitions.list` is neither an object nor a boolean, so it is not read as an operation',
        fix: 'make it a schema, or move it out of `definitions`',
      },
    ]);
  });

  it('knows the five dialects, with or without the scheme and trailing `#`, and flags any other', () => {
    for (const $schema of [
      'https://json-schema.org/draft/2020-12/schema',
      'https://json-schema.org/draft/2019-09/schema',
      'http://json-schema.org/draft-07/schema#',
      'http://json-schema.org/draft-06/schema#',
      'http://json-schema.org/draft-04/schema',
      'https://json-schema.org/draft-04/schema#',
    ]) {
      expect(read({ $schema }).findings).toEqual([]);
    }
    for (const $schema of ['http://json-schema.org/draft-03/schema#', 'ftp://json-schema.org/draft-07/schema', 'json-schema.org/draft-07/schema##']) {
      expect(read({ $schema }).findings).toEqual([
        {
          code: 'dialect-unknown',
          pointer: '#/$schema',
          message: `\`$schema: ${$schema}\` is not a dialect this reader knows; it is read as 2020-12`,
          fix: 'use the 2020-12, 2019-09, draft-07, draft-06 or draft-04 meta-schema URI',
        },
      ]);
    }
    expect(read({ $schema: 'json-schema.org/draft-07/schema#' }).findings).toEqual([]);
    expect(read({ $schema: 3 }).findings).toEqual([]);
  });
});

const codes = (document: unknown): string[] => (read(document).findings ?? []).map(({ code, pointer }) => `${code} ${pointer}`);

describe('references core/resolve.ts cannot follow from the root', () => {
  it('flags each kind once, where it is written', () => {
    const document = {
      properties: {
        uri: { $ref: 'other.json#/a' },
        anchor: { $ref: '#node' },
        root: { $ref: '#' },
        local: { $ref: '#/$defs/a' },
        dynamic: { $dynamicRef: '#meta' },
        recursive: { $recursiveRef: '#' },
      },
      $defs: { a: { type: 'string' } },
    };
    expect(read(document).findings).toEqual([
      {
        code: 'ref-external',
        pointer: '#/properties/uri/$ref',
        message: '`$ref: other.json#/a` is a URI, not a fragment of this document, and is passed as written',
        fix: 'bundle the schemas into one document first, or use a `#/…` reference',
      },
      {
        code: 'ref-anchor',
        pointer: '#/properties/anchor/$ref',
        message: '`$ref: #node` names an anchor, which is passed as written; only JSON Pointers are resolved',
        fix: 'reference the subschema by JSON Pointer, e.g. `#/$defs/…`',
      },
      {
        code: 'ref-dynamic',
        pointer: '#/properties/dynamic/$dynamicRef',
        message: '`$dynamicRef: #meta` is passed as written; references are resolved only through `$ref`',
        fix: 'use a `$ref` to a `#/$defs/…` pointer where the dynamic scope is not needed',
      },
      {
        code: 'ref-dynamic',
        pointer: '#/properties/recursive/$recursiveRef',
        message: '`$recursiveRef: #` is passed as written; references are resolved only through `$ref`',
        fix: 'use a `$ref` to a `#/$defs/…` pointer where the dynamic scope is not needed',
      },
    ]);
  });

  it('flags a pointer inside an embedded resource, but not inside the root or a fragment `$id`', () => {
    const document = {
      $id: 'https://example.com/root',
      $ref: '#/$defs/b',
      $defs: {
        a: { $id: 'a.json', items: [{ $ref: '#/$defs/x' }], $defs: { x: { $ref: '#' } } },
        b: { $id: '#b', $ref: '#/$defs/a' },
        c: { id: 'c.json', $ref: '#' },
        d: { $id: 4, id: 'd.json', $ref: '#' },
        e: { id: '#e', $ref: '#' },
      },
    };
    expect(read(document).findings).toEqual([
      {
        code: 'ref-in-embedded-resource',
        pointer: '#/$defs/a/items/0/$ref',
        message: '`$ref: #/$defs/x` is relative to the embedded resource at `#/$defs/a`, and is resolved from the document root',
        fix: "move the subschema under the root's `$defs` and drop its `$id`",
      },
      {
        code: 'ref-in-embedded-resource',
        pointer: '#/$defs/a/$defs/x/$ref',
        message: '`$ref: #` is relative to the embedded resource at `#/$defs/a`, and is resolved from the document root',
        fix: "move the subschema under the root's `$defs` and drop its `$id`",
      },
      {
        code: 'ref-in-embedded-resource',
        pointer: '#/$defs/c/$ref',
        message: '`$ref: #` is relative to the embedded resource at `#/$defs/c`, and is resolved from the document root',
        fix: "move the subschema under the root's `$defs` and drop its `$id`",
      },
      {
        code: 'ref-in-embedded-resource',
        pointer: '#/$defs/d/$ref',
        message: '`$ref: #` is relative to the embedded resource at `#/$defs/d`, and is resolved from the document root',
        fix: "move the subschema under the root's `$defs` and drop its `$id`",
      },
    ]);
  });

  it('does not read a `$ref` written as data, or a property named `$ref`, as a reference', () => {
    expect(
      codes({
        const: { $ref: 'x.json' },
        default: { $ref: 'x.json' },
        enum: [{ $ref: 'x.json' }],
        examples: [{ $ref: 'x.json' }],
        properties: { $ref: { type: 'string' } },
      }),
    ).toEqual([]);
    expect(codes({ properties: { $ref: { $ref: 'x.json' } } })).toEqual(['ref-external #/properties/$ref/$ref']);
    expect(codes({ $defs: { 'a/~b': { $ref: '#c' } } })).toEqual(['ref-anchor #/$defs/a~1~0b/$ref']);
  });
});

describe('the JSON-Schema-Test-Suite `$ref`, `$defs` and anchor cases', () => {
  it('reads at least 20 real documents without throwing', () => {
    expect(cases.length).toBeGreaterThanOrEqual(20);
    expect(cases.length).toBe(46);
    for (const { schema } of cases) expect(() => read(schema)).not.toThrow();
  });

  it('resolves every reference through core/resolve.ts in each document it reports nothing for', () => {
    const clean = cases.filter(({ schema }) => read(schema).findings?.length === 0);
    expect(clean.length).toBe(27);
    for (const { file, description, schema } of clean) {
      for (const { id, payloads } of read(schema).operations) {
        expect(() => inline(schema, payloads[0]?.schema), `${file}: ${description}: ${id}`).not.toThrow();
      }
    }
  });

  it('reports what it could not resolve, by kind', () => {
    const tally: Record<string, number> = {};
    for (const { schema } of cases) for (const { code } of read(schema).findings ?? []) tally[code] = (tally[code] ?? 0) + 1;
    expect(tally).toEqual({ 'ref-anchor': 1, 'ref-external': 18 });
  });
});

describe('adapter', () => {
  it('is the host shape, under its own name', () => {
    expect(adapter).toMatchObject({ name: 'jsonschema', detect, read });
    expect(adapter.description).toContain('2020-12');
    expect(Object.isFrozen(adapter)).toBe(true);
  });
});
