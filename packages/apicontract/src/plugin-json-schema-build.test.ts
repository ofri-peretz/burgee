import { describe, expect, it } from 'vitest';

import { type Contract, type JsonSchema } from './core/model.js';
import { build, type BuildOptions, KEYWORDS, sourceOf, URI_07, URI_2020 } from './plugin-json-schema-build.js';

const AT = '#/paths/~1x/post';

const options = (more: Partial<BuildOptions> = {}): BuildOptions => ({ draft: '2020-12', refs: 'keep', source: '2020-12', label: 'X', at: AT, ...more });

const run = (schema: JsonSchema, more: Partial<BuildOptions> = {}, document: unknown = {}) => build(document, schema, options(more));

const contract = (format: string, document: unknown): Contract => ({ format, document, operations: [] });

describe('the dialect a source writes', () => {
  it('is read from the format and the document', () => {
    expect(sourceOf(contract('openapi', { openapi: '3.0.3' }))).toBe('oas30');
    expect(sourceOf(contract('openapi', { openapi: '3.1.0' }))).toBe('2020-12');
    expect(sourceOf(contract('swagger2', { swagger: '2.0' }))).toBe('oas30');
    expect(sourceOf(contract('asyncapi', { asyncapi: '3.0.0' }))).toBe('07');
    expect(sourceOf(contract('jsonschema', { $schema: 'http://json-schema.org/draft-07/schema#' }))).toBe('07');
    expect(sourceOf(contract('jsonschema', { $schema: 'http://json-schema.org/draft-04/schema#' }))).toBe('07');
    expect(sourceOf(contract('jsonschema', { $schema: 'http://json-schema.org/draft-06/schema#' }))).toBe('07');
    expect(sourceOf(contract('jsonschema', { $schema: 'https://json-schema.org/draft/2020-12/schema' }))).toBe('2020-12');
    expect(sourceOf(contract('jsonschema', { $schema: 1 }))).toBe('2020-12');
    expect(sourceOf(contract('jsonschema', true))).toBe('2020-12');
    expect(sourceOf(contract('mcp', null))).toBe('2020-12');
    expect(sourceOf(contract('jsonschema', ['draft-07']))).toBe('2020-12');
    expect(sourceOf(contract('jsonschema', { $schema: ['draft-07'] }))).toBe('2020-12');
  });
});

describe('a payload as a document', () => {
  it('is the schema under `$schema`, every keyword kept, in order', () => {
    const schema = { type: 'object', properties: { a: { type: 'string', enum: [{ $ref: '#/data' }] } }, required: ['a'], additionalProperties: false, allOf: [{ minProperties: 1 }] };
    expect(run(schema)).toEqual({ schema: { $schema: URI_2020, ...schema }, findings: [] });
  });

  it('is `{}` for `true` and `{ not: {} }` for `false`', () => {
    expect(run(true).schema).toEqual({ $schema: URI_2020 });
    expect(run(false).schema).toEqual({ $schema: URI_2020, not: {} });
    expect(run({ items: true, not: false }).schema).toEqual({ $schema: URI_2020, items: true, not: false });
  });

  it('leaves out a keyword no validator applies, with one finding per schema', () => {
    expect(run({ type: 'string', 'x-a': 1 }).findings).toEqual([
      { code: 'keyword-dropped', pointer: AT, message: 'X: `x-a` is not a keyword a JSON Schema validator applies here, and is left out', fix: 'move what it means into a keyword the dialect has, or into `description`' },
    ]);
    const { schema, findings } = run({ properties: { a: { 'x-a': 1, $id: 'a', discriminator: {} } } });
    expect(schema).toEqual({ $schema: URI_2020, properties: { a: {} } });
    expect(findings.map((finding) => [finding.pointer, finding.message])).toEqual([
      [`${AT}/properties/a`, 'X: `x-a`, `$id`, `discriminator` are not keywords a JSON Schema validator applies here, and are left out'],
    ]);
  });

  it('replaces the payload\'s own `$schema`, and reports one in a subschema', () => {
    expect(run({ $schema: 'whatever', type: 'string' })).toEqual({ schema: { $schema: URI_2020, type: 'string' }, findings: [] });
    expect(run({ items: { $schema: 'x' } }).findings.map((finding) => finding.message)).toEqual(['X: `$schema` is not a keyword a JSON Schema validator applies here, and is left out']);
  });

  it('writes shared schemas once under its own `$defs`, never the source\'s', () => {
    expect(run({ $defs: { A: { type: 'string' } }, definitions: { B: {} }, type: 'number' })).toEqual({ schema: { $schema: URI_2020, type: 'number' }, findings: [] });
  });

  it('walks a schema under each kind of keyword, and escapes a key in a pointer', () => {
    const { findings } = run({ anyOf: [{ 'x-a': 1 }], properties: { 'a/b~': { 'x-b': 1 } }, not: { 'x-c': 1 } });
    expect(findings.map((finding) => finding.pointer)).toEqual([`${AT}/anyOf/0`, `${AT}/properties/a~1b~0`, `${AT}/not`]);
  });

  it('refuses a schema that is not one, with a fix', () => {
    expect(() => run({ items: 3 })).toThrow('cannot generate X: the schema at "#/paths/~1x/post/items" is neither an object nor a boolean. fix: correct the document, or validate it against its dialect\'s meta-schema first');
    expect(() => run({ items: [] })).toThrow('the schema at "#/paths/~1x/post/items" is neither an object nor a boolean');
    expect(() => run({ items: null })).toThrow('is neither an object nor a boolean');
    expect(() => run({ anyOf: {} })).toThrow('the schema at "#/paths/~1x/post/anyOf" is not a list of schemas');
    expect(() => run({ properties: [] })).toThrow('the schema at "#/paths/~1x/post/properties" is not an object of schemas');
    expect(() => run({ properties: null })).toThrow('is not an object of schemas');
    expect(() => run({ $ref: 3 })).toThrow('the schema at "#/paths/~1x/post" has a `$ref` that is not a string');
  });
});

describe('what a source writes in its own way', () => {
  it('reads draft-04\'s boolean exclusive bounds as numbers', () => {
    expect(run({ minimum: 1, exclusiveMinimum: true, maximum: 9, exclusiveMaximum: false })).toEqual({
      schema: { $schema: URI_2020, exclusiveMinimum: 1, maximum: 9 },
      findings: [
        { code: 'keyword-rewritten', pointer: `${AT}/exclusiveMinimum`, message: 'X: `exclusiveMinimum: true` is the boolean form of draft-04: written as `exclusiveMinimum: 1`', fix: 'nothing to do: the document means the same' },
        { code: 'keyword-rewritten', pointer: `${AT}/exclusiveMaximum`, message: 'X: `exclusiveMaximum: false` is the boolean form of draft-04: written as `maximum` alone', fix: 'nothing to do: the document means the same' },
      ],
    });
    expect(run({ exclusiveMaximum: true })).toStrictEqual({
      schema: { $schema: URI_2020 },
      findings: [
        {
          code: 'keyword-dropped',
          pointer: `${AT}/exclusiveMaximum`,
          message: 'X: `exclusiveMaximum: true` is the boolean form of draft-04, and there is no `maximum` beside it: it is left out',
          fix: 'nothing to do: it says nothing without the bound',
        },
      ],
    });
    expect(run({ exclusiveMinimum: false, minimum: 2 }).schema).toStrictEqual({ $schema: URI_2020, minimum: 2 });
    expect(run({ exclusiveMinimum: 3 })).toEqual({ schema: { $schema: URI_2020, exclusiveMinimum: 3 }, findings: [] });
  });

  it('reads OpenAPI 3.0\'s `nullable`', () => {
    const oas = { source: 'oas30' } as const;
    expect(run({ type: 'string', nullable: true }, oas)).toEqual({
      schema: { $schema: URI_2020, type: ['string', 'null'] },
      findings: [{ code: 'keyword-rewritten', pointer: `${AT}/nullable`, message: 'X: `nullable: true` is written as `type: ["string", "null"]`', fix: 'nothing to do: the document means the same' }],
    });
    expect(run({ nullable: true }, oas)).toEqual({
      schema: { $schema: URI_2020 },
      findings: [
        {
          code: 'keyword-dropped',
          pointer: `${AT}/nullable`,
          message: 'X: `nullable: true` without a `type` adds nothing in OpenAPI 3.0.3, and is left out',
          fix: 'give the schema a `type`, or write `type: [..., "null"]` once on OpenAPI 3.1',
        },
      ],
    });
    expect(run({ type: 'string', nullable: false }, oas)).toEqual({ schema: { $schema: URI_2020, type: 'string' }, findings: [] });
    expect(run({ type: ['string'], nullable: true }, oas).schema).toEqual({ $schema: URI_2020, type: ['string'] });
    expect(run({ type: 'string', nullable: true }).findings.map((finding) => finding.code)).toEqual(['keyword-dropped']);
  });

  it('reads OpenAPI\'s `example` as `examples`', () => {
    expect(run({ example: 3 })).toEqual({
      schema: { $schema: URI_2020, examples: [3] },
      findings: [{ code: 'keyword-rewritten', pointer: `${AT}/example`, message: 'X: `example` is written as `examples: [example]`', fix: 'nothing to do: the document means the same' }],
    });
    expect(run({ example: 3, examples: [4] })).toEqual({
      schema: { $schema: URI_2020, examples: [4] },
      findings: [{ code: 'keyword-dropped', pointer: `${AT}/example`, message: 'X: `example` beside `examples` is left out', fix: 'move the example into `examples`' }],
    });
  });

  it('reads draft-07\'s tuple `items` and `dependencies`', () => {
    const d7 = { source: '07' } as const;
    expect(run({ items: [{ type: 'string' }], additionalItems: false, dependencies: { a: ['b'], c: { required: ['d'] } } }, d7)).toEqual({
      schema: { $schema: URI_2020, prefixItems: [{ type: 'string' }], items: false, dependentRequired: { a: ['b'] }, dependentSchemas: { c: { required: ['d'] } } },
      findings: [
        {
          code: 'keyword-rewritten',
          pointer: `${AT}/items`,
          message: 'X: draft-07\'s list of `items` is written as `prefixItems`, and `additionalItems` as `items`',
          fix: 'nothing to do: the document means the same',
        },
        {
          code: 'keyword-rewritten',
          pointer: `${AT}/dependencies`,
          message: 'X: `dependencies` is written as `dependentRequired` (lists of keys) and `dependentSchemas` (schemas)',
          fix: 'nothing to do: the document means the same',
        },
      ],
    });
    expect(run({ items: [], dependencies: { a: ['b'] } }, d7).schema).toEqual({ $schema: URI_2020, prefixItems: [], dependentRequired: { a: ['b'] } });
    expect(run({ dependencies: { c: true } }, d7).schema).toEqual({ $schema: URI_2020, dependentSchemas: { c: true } });
    expect(run({ items: { type: 'string' }, dependencies: [] }, d7).schema).toEqual({ $schema: URI_2020, items: { type: 'string' } });
    expect(run({ additionalItems: {}, dependencies: { a: ['b'] } }).findings.map((finding) => finding.message)).toEqual([
      'X: `additionalItems`, `dependencies` are not keywords a JSON Schema validator applies here, and are left out',
    ]);
  });

  it('ignores what stands beside a `$ref` where the source\'s dialect does', () => {
    const document = { A: { type: 'string' } };
    expect(run({ $ref: '#/A', description: 'd', title: 't' }, { source: 'oas30' }, document)).toEqual({
      schema: { $schema: URI_2020, $ref: '#/$defs/A', $defs: { A: { type: 'string' } } },
      findings: [
        {
          code: 'keyword-dropped',
          pointer: AT,
          message: 'X: `description`, `title` beside `$ref` are ignored by the source\'s dialect, and left out',
          fix: 'move them into the referenced schema, or put the `$ref` under `allOf` beside them',
        },
      ],
    });
    expect(run({ $ref: '#/A', description: 'd' }, { source: '07' }, document).findings[0]?.message).toBe('X: `description` beside `$ref` is ignored by the source\'s dialect, and left out');
    expect(run({ $ref: '#/A' }, { source: '07' }, document).findings).toEqual([]);
    expect(run({ $ref: '#/A', description: 'd' }, {}, document)).toEqual({ schema: { $schema: URI_2020, $ref: '#/$defs/A', description: 'd', $defs: { A: { type: 'string' } } }, findings: [] });
  });
});

describe('references', () => {
  const document = {
    components: {
      schemas: {
        Pet: { type: 'object', properties: { owner: { $ref: '#/components/schemas/Person' } } },
        Person: { type: 'object', properties: { pets: { type: 'array', items: { $ref: '#/components/schemas/Pet' } } } },
        'a b': { type: 'string' },
        'a%20b': { type: 'number' },
        '': { type: 'null' },
        'x~1y': { type: 'boolean' },
        'p/q': { type: 'boolean' },
      },
    },
    other: { Pet: { type: 'integer' } },
  };

  it('keeps each target once under `$defs`, named by the last part of its pointer', () => {
    expect(run({ $ref: '#/components/schemas/Pet' }, {}, document).schema).toEqual({
      $schema: URI_2020,
      $ref: '#/$defs/Pet',
      $defs: {
        Pet: { type: 'object', properties: { owner: { $ref: '#/$defs/Person' } } },
        Person: { type: 'object', properties: { pets: { type: 'array', items: { $ref: '#/$defs/Pet' } } } },
      },
    });
  });

  it('makes a name safe and unique, and names the document itself `root`', () => {
    const schema = {
      anyOf: [
        { $ref: '#/components/schemas/a b' },
        { $ref: '#/components/schemas/a%20b' },
        { $ref: '#/components/schemas/' },
        { $ref: '#/components/schemas/x~01y' },
        { $ref: '#/components/schemas/p~1q' },
        { $ref: '#/other/Pet' },
        { $ref: '#/components/schemas/Pet' },
        { $ref: '#/components/schemas/a b' },
      ],
    };
    const { schema: out } = run(schema, {}, { ...document, components: { schemas: { ...document.components.schemas, Pet: { type: 'string' } } } });
    expect(out.anyOf).toEqual([
      { $ref: '#/$defs/a_b' },
      { $ref: '#/$defs/a_b2' },
      { $ref: '#/$defs/def' },
      { $ref: '#/$defs/x_1y' },
      { $ref: '#/$defs/p_q' },
      { $ref: '#/$defs/Pet' },
      { $ref: '#/$defs/Pet2' },
      { $ref: '#/$defs/a_b' },
    ]);
    expect(run({ $ref: '#' }, {}, { type: 'string' }).schema).toEqual({ $schema: URI_2020, $ref: '#/$defs/root', $defs: { root: { type: 'string' } } });
    expect(Object.keys(run({ $ref: '#/a.b-c_d' }, {}, { 'a.b-c_d': {} }).schema.$defs as object)).toEqual(['a.b-c_d']);
  });

  it('inlines each target, and keeps under `$defs` only one that refers to itself, reported once', () => {
    const { schema, findings } = run({ properties: { a: { $ref: '#/components/schemas/Pet' }, b: { $ref: '#/components/schemas/Pet' } } }, { refs: 'inline' }, document);
    const pet = { type: 'object', properties: { owner: { type: 'object', properties: { pets: { type: 'array', items: { $ref: '#/$defs/Pet' } } } } } };
    expect(schema).toEqual({ $schema: URI_2020, properties: { a: pet, b: pet }, $defs: { Pet: pet } });
    expect(findings).toEqual([
      {
        code: 'ref-cycle-kept',
        pointer: '#/components/schemas/Pet',
        message: 'X: `#/components/schemas/Pet` refers to itself, so it cannot be inlined: it is kept under `$defs`',
        fix: 'nothing to do; or generate with `refs: keep`',
      },
    ]);
  });

  it('inlines a target beside other keywords under `allOf`, before the ones already there', () => {
    const document2 = { A: { type: 'string' } };
    expect(run({ $ref: '#/A', minLength: 1 }, { refs: 'inline' }, document2).schema).toEqual({ $schema: URI_2020, minLength: 1, allOf: [{ type: 'string' }] });
    expect(run({ $ref: '#/A', allOf: [{ maxLength: 3 }] }, { refs: 'inline' }, document2).schema).toEqual({ $schema: URI_2020, allOf: [{ type: 'string' }, { maxLength: 3 }] });
    expect(run({ $ref: '#/A' }, { refs: 'inline' }, document2)).toEqual({ schema: { $schema: URI_2020, type: 'string' }, findings: [] });
  });

  it('leaves out a reference outside the document, with a finding: the document stays whole', () => {
    expect(run({ $ref: 'other.json#/A', description: 'd' })).toEqual({
      schema: { $schema: URI_2020, description: 'd' },
      findings: [
        {
          code: 'ref-unresolved',
          pointer: `${AT}/$ref`,
          message: 'X: `$ref: "other.json#/A"` is not a JSON Pointer into this document, and is left out: the document accepts any value there',
          fix: 'bundle the document first, so every `$ref` is a `#/…` pointer',
        },
      ],
    });
    expect(run({ $ref: '#anchor' }).findings.map((finding) => finding.code)).toEqual(['ref-unresolved']);
  });

  it('refuses a pointer to nothing, with the resolver\'s fix', () => {
    expect(() => run({ $ref: '#/missing' })).toThrow('cannot resolve `#/missing`: nothing is at `missing`. fix: point it at a value the document defines');
  });
});

describe('draft-07', () => {
  const d7 = { draft: '07' } as const;

  it('writes `$defs` as `definitions` and points every reference there', () => {
    expect(run({ $ref: '#/A' }, d7, { A: { items: { $ref: '#/A' } } })).toEqual({
      schema: { $schema: URI_07, $ref: '#/definitions/A', definitions: { A: { items: { $ref: '#/definitions/A' } } } },
      findings: [{ code: 'keyword-rewritten', pointer: AT, message: 'X: `$defs` is written as draft-07\'s `definitions`', fix: 'nothing to do: the document means the same' }],
    });
    expect(run({ type: 'string' }, d7)).toStrictEqual({ schema: { $schema: URI_07, type: 'string' }, findings: [] });
  });

  it('writes a tuple as `items` and `additionalItems`', () => {
    expect(run({ properties: { p: { prefixItems: [{}], items: false } } }, d7)).toEqual({
      schema: { $schema: URI_07, properties: { p: { items: [{}], additionalItems: false } } },
      findings: [
        {
          code: 'keyword-rewritten',
          pointer: AT,
          message: 'X: at "/properties/p" in the document, `prefixItems` is written as draft-07\'s list of `items`, and `items` as `additionalItems`',
          fix: 'nothing to do: the document means the same',
        },
      ],
    });
    expect(run({ anyOf: [{ prefixItems: [{}] }] }, d7).schema).toStrictEqual({ $schema: URI_07, anyOf: [{ items: [{}] }] });
    expect(run({ items: { prefixItems: [{}] } }, d7).findings[0]?.message).toBe('X: at "/items" in the document, `prefixItems` is written as draft-07\'s list of `items`, and `items` as `additionalItems`');
    expect(run({ anyOf: [{ prefixItems: [{}] }] }, d7).findings[0]?.message).toBe('X: at "/anyOf/0" in the document, `prefixItems` is written as draft-07\'s list of `items`, and `items` as `additionalItems`');
  });

  it('writes `dependentRequired` and `dependentSchemas` as `dependencies`', () => {
    expect(run({ dependentRequired: { a: ['b'] }, dependentSchemas: { c: { required: ['d'] } } }, d7)).toEqual({
      schema: { $schema: URI_07, dependencies: { a: ['b'], c: { required: ['d'] } } },
      findings: [
        {
          code: 'keyword-rewritten',
          pointer: AT,
          message: 'X: at "" in the document, `dependentRequired` and `dependentSchemas` are written as `dependencies`',
          fix: 'nothing to do: the document means the same',
        },
      ],
    });
    expect(run({ dependentRequired: { a: ['b'] } }, d7).schema).toEqual({ $schema: URI_07, dependencies: { a: ['b'] } });
    expect(run({ dependentSchemas: { c: {} } }, d7).schema).toEqual({ $schema: URI_07, dependencies: { c: {} } });
  });

  it('leaves out what draft-07 does not have, with a finding', () => {
    expect(run({ contains: {}, minContains: 2, maxContains: 3, unevaluatedProperties: false, unevaluatedItems: false }, d7)).toEqual({
      schema: { $schema: URI_07, contains: {} },
      findings: [
        {
          code: 'keyword-dropped',
          pointer: AT,
          message: 'X: at "" in the document, draft-07 has no `minContains`, `maxContains`, `unevaluatedItems`, `unevaluatedProperties`, and they are left out: the document accepts more than the schema',
          fix: 'generate with `draft: 2020-12`',
        },
      ],
    });
    expect(run({ unevaluatedItems: false }, d7).findings[0]?.message).toBe('X: at "" in the document, draft-07 has no `unevaluatedItems`, and it is left out: the document accepts more than the schema');
  });

  it('puts a `$ref` with keywords beside it under `allOf`, before the ones there', () => {
    const document = { A: {} };
    expect(run({ properties: { a: { $ref: '#/A', minLength: 1 } } }, d7, document).schema).toEqual({
      $schema: URI_07,
      properties: { a: { minLength: 1, allOf: [{ $ref: '#/definitions/A' }] } },
      definitions: { A: {} },
    });
    expect(run({ properties: { a: { $ref: '#/A', allOf: [{ maxLength: 1 }] } } }, d7, document).schema).toEqual({
      $schema: URI_07,
      properties: { a: { allOf: [{ $ref: '#/definitions/A' }, { maxLength: 1 }] } },
      definitions: { A: {} },
    });
    expect(run({ properties: { a: { $ref: '#/A', minLength: 1 } } }, d7, document).findings).toEqual([
      {
        code: 'keyword-rewritten',
        pointer: AT,
        message: 'X: at "/properties/a" in the document, `$ref` with keywords beside it is written under `allOf`, which draft-07 does not ignore',
        fix: 'nothing to do: the document means the same',
      },
      { code: 'keyword-rewritten', pointer: AT, message: 'X: `$defs` is written as draft-07\'s `definitions`', fix: 'nothing to do: the document means the same' },
    ]);
  });
});

/** A value of the keyword's own kind, for it to stand alone in a subschema. */
const keywordValue = (keyword: string): unknown => {
  const kind = KEYWORDS.get(keyword);
  if (kind === 'schema') return {};
  if (kind === 'list') return [{}];
  if (kind === 'map' || keyword === '$defs' || keyword === 'definitions') return { a: {} };
  if (keyword === 'nullable') return true;
  return keyword === 'required' ? ['a'] : 1;
};

describe('every keyword is kept or reported (J3)', () => {
  // Each keyword alone in a subschema, with a value of its own kind.
  const others = ['$id', '$anchor', '$dynamicRef', '$dynamicAnchor', '$recursiveRef', '$recursiveAnchor', '$vocabulary', '$schema', 'id', 'nullable', 'example', 'discriminator', 'xml', 'externalDocs', 'x-any', 'additionalItems', 'dependencies', 'definitions', '$defs', '$ref', 'anything'];

  it.each([...KEYWORDS.keys(), ...others])('%s', (keyword) => {
    for (const draft of ['2020-12', '07'] as const) {
      for (const source of ['2020-12', '07', 'oas30'] as const) {
        const subschema = keyword === '$ref' ? { $ref: 'elsewhere.json' } : { [keyword]: keywordValue(keyword), ...(keyword === 'definitions' || keyword === '$defs' ? { $ref: `#/properties/p/${keyword}/a` } : {}) };
        const document = { properties: { p: subschema } };
        const { schema, findings } = build(document, document, options({ draft, source }));
        const text = JSON.stringify(schema);
        const kept = text.includes(`"${keyword}"`) || (keyword === '$defs' && text.includes('"definitions"')) || (keyword === 'definitions' && text.includes('"$defs"'));
        const reported = findings.some((finding) => finding.message.includes(`\`${keyword}`));
        expect(kept || reported, `${keyword} in ${source}, written as ${draft}`).toBe(true);
      }
    }
  });
});
