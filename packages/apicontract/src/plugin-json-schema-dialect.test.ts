import { describe, expect, it } from 'vitest';

import { type Document, KEYWORDS } from './plugin-json-schema-build.js';
import { type Dialect, narrow, overLimits } from './plugin-json-schema-dialect.js';
import { DIALECTS } from './plugin-json-schema.js';

const AT = '#/paths/~1x/post';
const WHERE = { label: 'X', at: AT };

/** A dialect that keeps the keywords named, and does nothing else. */
const table = (more: Partial<Dialect> = {}): Dialect => ({
  source: 'https://example.com',
  read: '2026-11-18',
  keywords: { type: 'keep', properties: 'keep', items: 'keep', anyOf: 'keep', description: 'keep', required: 'keep', additionalProperties: 'keep', format: 'keep', enum: 'keep' },
  rootMustBeObject: false,
  additionalPropertiesFalseRequired: false,
  allRequired: false,
  recursion: true,
  refs: 'keep',
  flat: false,
  limits: [],
  ...more,
});

const run = (schema: Document, more: Partial<Dialect> = {}) => narrow('p', table(more), schema, WHERE);

describe('narrowing to a dialect', () => {
  it('keeps what the table keeps, walks every kind of keyword, and drops `$schema` without a word', () => {
    const schema = { $schema: 'x', type: 'object', properties: { a: { type: 'array', items: { anyOf: [{ type: 'string' }] } } }, enum: [{ minimum: 1 }] };
    expect(run(schema)).toStrictEqual({ narrowed: { schema: { type: 'object', properties: schema.properties, enum: [{ minimum: 1 }] }, findings: [], dropped: [] }, findings: [] });
  });

  it('drops a keyword the table does not list, with a finding and a line for the re-check', () => {
    const result = run({ type: 'object', properties: { a: { type: 'string', minLength: 2 } } });
    expect(result.narrowed?.schema).toEqual({ type: 'object', properties: { a: { type: 'string' } } });
    expect(result.narrowed?.dropped).toEqual(['/properties/a: `minLength` 2']);
    expect(result.findings).toEqual([
      {
        code: 'dialect-dropped',
        pointer: AT,
        message: 'X: for p, at "/properties/a" in the document, `minLength` is not a keyword p accepts, and is left out of the narrowed schema: the re-check holds the answer to it',
        fix: 'validate the answer with the generated re-check before using it',
      },
    ]);
    expect(run({ minLength: 2 }).narrowed?.dropped).toEqual(['/: `minLength` 2']);
    expect(run({ anyOf: [{ minLength: 2 }], properties: { 'd~e': { minLength: 3 } } }).narrowed?.dropped).toEqual(['/anyOf/0: `minLength` 2', '/properties/d~0e: `minLength` 3']);
    expect(run({ minLength: 2 }, { keywords: { minLength: 'drop' } }).narrowed?.dropped).toEqual(['/: `minLength` 2']);
  });

  it('says a constraint in `description` where the table rewrites it', () => {
    const said = { rewrite: 'description' } as const;
    const result = run({ type: 'string', minLength: 2, maxLength: 5 }, { keywords: { type: 'keep', minLength: said, maxLength: said } });
    expect(result.narrowed?.schema).toEqual({ type: 'string', description: '(minLength: 2; maxLength: 5)' });
    expect(result.narrowed?.dropped).toEqual(['/: `minLength` 2', '/: `maxLength` 5']);
    expect(result.findings[0]).toEqual({
      code: 'dialect-rewritten',
      pointer: AT,
      message: 'X: for p, at "" in the document, `minLength` is not a keyword p enforces: it is said in `description` instead',
      fix: 'validate the answer with the generated re-check before using it',
    });
    expect(run({ description: 'Name.', minLength: 2 }, { keywords: { description: 'keep', minLength: said } }).narrowed?.schema).toEqual({ description: 'Name. (minLength: 2)' });
    expect(run({ description: 3, minLength: 2 }, { keywords: { description: 'keep', minLength: said } }).narrowed?.schema).toEqual({ description: '(minLength: 2)' });
  });

  it('keeps a bound up to the most the table allows', () => {
    const keywords = { minItems: { atMost: 1 } };
    expect(run({ minItems: 1 }, { keywords }).narrowed?.schema).toEqual({ minItems: 1 });
    expect(run({ minItems: 0 }, { keywords }).narrowed?.schema).toEqual({ minItems: 0 });
    const above = run({ minItems: 2 }, { keywords });
    expect(above.narrowed?.schema).toEqual({});
    expect(above.findings[0]?.message).toBe('X: for p, at "" in the document, `minItems` above 1 is not accepted by p, and is left out of the narrowed schema: the re-check holds the answer to it');
    expect(run({ minItems: '9' }, { keywords }).narrowed?.schema).toEqual({ minItems: '9' });
  });

  it('keeps only the formats the table lists', () => {
    expect(run({ format: 'email' }, { formats: ['email'] }).narrowed?.schema).toEqual({ format: 'email' });
    expect(run({ format: 'uri' }).narrowed?.schema).toEqual({ format: 'uri' });
    const dropped = run({ format: 'uri' }, { formats: ['email'] });
    expect(dropped.narrowed?.schema).toEqual({});
    expect(dropped.findings[0]?.message).toBe('X: for p, at "" in the document, `format` "uri" is not a format p accepts, and is left out of the narrowed schema: the re-check holds the answer to it');
  });

  it('keeps references and walks `$defs` where the dialect allows recursion, and cuts them where it does not', () => {
    const schema = { $ref: '#/$defs/A', $defs: { A: { type: 'object', minProperties: 1 } } };
    expect(run(schema).narrowed?.schema).toEqual({ $ref: '#/$defs/A', $defs: { A: { type: 'object' } } });
    const cut = run({ type: 'object', properties: { a: { $ref: '#/$defs/A' } }, $defs: { A: {} } }, { recursion: false });
    expect(cut.narrowed?.schema).toEqual({ type: 'object', properties: { a: {} } });
    expect(cut.narrowed?.dropped).toEqual(['/properties/a: `$ref` "#/$defs/A"']);
    expect(cut.findings[0]?.message).toBe('X: for p, at "/properties/a" in the document, `$ref` refers to a schema that contains itself, which p does not allow, and is left out of the narrowed schema: the re-check holds the answer to it');
  });

  it('refuses a root that is not an object where the dialect asks for one', () => {
    expect(run({ type: 'object' }, { rootMustBeObject: true }).narrowed?.schema).toEqual({ type: 'object' });
    expect(run({ type: 'string' }, { rootMustBeObject: true })).toEqual({
      findings: [
        {
          code: 'dialect-root-not-object',
          pointer: AT,
          message: 'X: for p, at "" in the document, p takes an object at the root, and this schema is not one: no narrowed schema is written for it',
          fix: 'wrap the payload in an object property, or generate without a dialect',
        },
      ],
    });
  });
});

describe('the object rules of a dialect', () => {
  it('closes every object, with a finding where it said otherwise', () => {
    const closed = { additionalPropertiesFalseRequired: true };
    expect(run({ type: 'object' }, closed)).toEqual({ narrowed: { schema: { type: 'object', additionalProperties: false }, findings: [], dropped: [] }, findings: [] });
    expect(run({ properties: {} }, closed).narrowed?.schema).toEqual({ properties: {}, additionalProperties: false });
    expect(run({ type: 'object', additionalProperties: false }, closed).findings).toEqual([]);
    const open = run({ type: 'object', additionalProperties: { type: 'string' } }, closed);
    expect(open.narrowed?.schema).toEqual({ type: 'object', additionalProperties: false });
    expect(open.findings[0]?.message).toBe('X: for p, at "" in the document, `additionalProperties` must be `false` for p, and is left out of the narrowed schema: the re-check holds the answer to it');
    expect(run({ type: 'string' }, closed).narrowed?.schema).toEqual({ type: 'string' });
  });

  it('makes every property required, an optional one nullable', () => {
    const all = { allRequired: true };
    const result = run({ type: 'object', properties: { a: { type: 'string' }, 'b/c': { type: 'integer' } }, required: ['a'] }, all);
    expect(result.narrowed?.schema).toEqual({ type: 'object', properties: { a: { type: 'string' }, 'b/c': { anyOf: [{ type: 'integer' }, { type: 'null' }] } }, required: ['a', 'b/c'] });
    expect(result.narrowed?.dropped).toEqual(['/properties/b~1c: optional, sent as `null` when absent']);
    expect(result.findings).toEqual([
      {
        code: 'dialect-rewritten',
        pointer: AT,
        message: 'X: for p, at "/properties/b~1c" in the document, the optional `b/c` is written as required and nullable, as p asks: the answer carries `null` where the key is absent',
        fix: 'drop a `null` the full schema does not allow before re-checking the answer',
      },
    ]);
    expect(run({ type: 'object', properties: { a: {} } }, all).narrowed?.schema).toEqual({ type: 'object', properties: { a: { anyOf: [{}, { type: 'null' }] } }, required: ['a'] });
    expect(run({ type: 'object' }, all).narrowed?.schema).toEqual({ type: 'object' });
  });

  it('keeps a flat object of primitives at the root, and drops any other property', () => {
    const flat = { flat: true };
    const properties = {
      s: { type: 'string' },
      n: { type: 'number' },
      i: { type: 'integer' },
      b: { type: 'boolean' },
      pick: { type: 'array', items: { enum: ['a'] } },
      picks: { type: 'array', items: { anyOf: [{ enum: ['a'] }] } },
      o: { type: 'object' },
      fake: { type: 'object', items: { enum: ['a'] } },
      list: { type: 'array', items: { type: 'string' } },
      bare: { type: 'array' },
      none: true,
    };
    const result = run({ type: 'object', properties, required: ['s', 'o'] }, flat);
    expect(Object.keys(result.narrowed?.schema.properties as object)).toEqual(['s', 'n', 'i', 'b', 'pick', 'picks']);
    expect(result.narrowed?.schema.required).toEqual(['s']);
    expect(result.narrowed?.dropped).toEqual(['/properties/o: `o` {"type":"object"}', '/properties/fake: `fake` {"type":"object","items":{"enum":["a"]}}', '/properties/list: `list` {"type":"array","items":{"type":"string"}}', '/properties/bare: `bare` {"type":"array"}', '/properties/none: `none` true']);
    expect(result.findings[0]?.message).toBe('X: for p, at "/properties/o" in the document, `o` is not a primitive, which p cannot ask for, and is left out of the narrowed schema: the re-check holds the answer to it');
    expect(run({ type: 'object', properties: { o: { type: 'object' } } }, flat).narrowed?.schema).toStrictEqual({ type: 'object', properties: {} });
    const nested = { type: 'object', properties: { o: { type: 'object' } } };
    expect(run({ type: 'object', anyOf: [nested], $defs: { D: nested } }, flat).narrowed?.schema).toStrictEqual({ type: 'object', anyOf: [nested], $defs: { D: nested } });
    // Only the root is flat: an object nested in a kept keyword is not looked at again.
    expect(run({ type: 'object', items: { type: 'object', properties: { o: { type: 'object' } } } }, flat).narrowed?.schema.items).toEqual({ type: 'object', properties: { o: { type: 'object' } } });
    expect(run({ type: 'object' }, flat).narrowed?.schema).toEqual({ type: 'object' });
  });
});

describe('limits', () => {
  // Each way into a subschema is on the path to the deepest object, and holds a property of its own.
  const deep = {
    type: 'object',
    properties: { m: { type: 'object', items: { type: 'object', anyOf: [{ type: 'object', properties: { l: {} }, additionalProperties: true }] } } },
    $defs: { D: { properties: { d: {} } } },
    enum: [{ type: 'object', properties: { a: { type: 'object', properties: { b: { type: 'object', properties: { c: { type: 'object', properties: { d: { type: 'object' } } } } } } } } }],
  };

  it('reaches a subschema under every kind of keyword, and only those', () => {
    const each = (measure: Dialect['limits'][number]['measure']) => overLimits('p', table({ limits: [{ measure, max: 0, per: 'schema' }] }), [{ label: 'C', at: '#/c', schema: deep }])[0]?.message;
    expect(each('properties')).toBe('C: 3 properties, and p takes at most 0');
    expect(each('optional')).toBe('C: 3 optional, and p takes at most 0');
    expect(each('depth')).toBe('C: 4 depth, and p takes at most 0');
    expect(each('enum')).toBe('C: 1 enum, and p takes at most 0');
  });

  const schemas = [
    { label: 'A', at: '#/a', schema: { type: 'object', properties: { x: { type: ['string', 'null'] }, y: { anyOf: [{}] } }, required: ['x'], $defs: { D: { type: 'object', properties: { z: { enum: [1, 2, 3] } } } } } },
    { label: 'B', at: '#/b', schema: { type: 'object', properties: { o: { type: 'object', properties: { p: { properties: {} } } } }, items: { enum: [4] }, anyOf: [{ not: true }] } },
  ];
  const limit = (measure: Dialect['limits'][number]['measure'], max: number, per: 'schema' | 'request' = 'schema') => overLimits('p', table({ limits: [{ measure, max, per }] }), schemas);

  it('counts each measure over each schema, and reports one over its limit', () => {
    expect(limit('properties', 3)).toEqual([]);
    expect(limit('properties', 1)).toEqual([{ code: 'dialect-limit', pointer: '#/a', message: 'A: 3 properties, and p takes at most 1', fix: 'split the payloads across requests, or simplify them: p refuses a request over the limit' }, { code: 'dialect-limit', pointer: '#/b', message: 'B: 2 properties, and p takes at most 1', fix: 'split the payloads across requests, or simplify them: p refuses a request over the limit' }]);
    expect(limit('optional', 1).map((finding) => finding.message)).toEqual(['A: 2 optional, and p takes at most 1', 'B: 2 optional, and p takes at most 1']);
    expect(limit('unions', 1).map((finding) => finding.message)).toEqual(['A: 2 unions, and p takes at most 1']);
    expect(limit('depth', 2).map((finding) => finding.message)).toEqual(['B: 3 depth, and p takes at most 2']);
    expect(limit('depth', 3)).toEqual([]);
    expect(limit('enum', 2).map((finding) => finding.message)).toEqual(['A: 3 enum, and p takes at most 2']);
  });

  it('adds a measure over every schema where the limit is per request', () => {
    expect(limit('optional', 4, 'request')).toEqual([]);
    expect(limit('optional', 3, 'request')).toEqual([{ code: 'dialect-limit', pointer: '', message: 'the generated schemas have 4 optional together, and p takes at most 3 in one request', fix: 'split the payloads across requests, or simplify them: p refuses a request over the limit' }]);
    expect(overLimits('p', table(), schemas)).toEqual([]);
  });
});

/** A value of the keyword's own kind, for it to stand alone in a subschema. */
const dialectValue = (keyword: string): unknown => {
  const kind = KEYWORDS.get(keyword);
  if (kind === 'schema') return { type: 'string' };
  if (kind === 'list') return [{ type: 'string' }];
  if (kind === 'map') return { a: { type: 'string' } };
  if (keyword === 'format') return 'regex';
  return keyword === 'required' ? ['a'] : 5;
};

describe('every dialect keeps or reports every keyword (J3)', () => {
  const cases = [...DIALECTS].flatMap(([name, dialect]) => [...KEYWORDS.keys(), '$ref'].map((keyword) => [name, keyword, dialect] as const));

  it.each(cases)('%s: %s', (name, keyword, dialect) => {
    const inner = keyword === '$ref' ? { $ref: '#/$defs/a' } : { type: 'string', [keyword]: dialectValue(keyword) };
    const schema = { type: 'object', properties: { a: inner }, $defs: { a: { type: 'string' } } };
    const { narrowed, findings } = narrow(name, dialect, schema, WHERE);
    const kept = JSON.stringify(narrowed?.schema.properties).includes(`"${keyword}"`);
    const reported = findings.some((finding) => finding.message.includes(`\`${keyword}\``) || (keyword !== '$ref' && finding.message.includes('`a` is not a primitive')));
    expect(kept || reported).toBe(true);
  });

  // The tables are the provider knowledge, read from the cited pages: a change to one is a change to this snapshot, made on purpose.
  it('pins the anthropic table', () => {
    expect(DIALECTS.get('anthropic')).toMatchInlineSnapshot(`
      {
        "additionalPropertiesFalseRequired": true,
        "allRequired": false,
        "flat": false,
        "formats": [
          "date-time",
          "time",
          "date",
          "duration",
          "email",
          "hostname",
          "uri",
          "ipv4",
          "ipv6",
          "uuid",
        ],
        "keywords": {
          "additionalProperties": "keep",
          "allOf": "keep",
          "anyOf": "keep",
          "const": "keep",
          "default": "keep",
          "description": "keep",
          "enum": "keep",
          "exclusiveMaximum": {
            "rewrite": "description",
          },
          "exclusiveMinimum": {
            "rewrite": "description",
          },
          "format": "keep",
          "items": "keep",
          "maxItems": {
            "rewrite": "description",
          },
          "maxLength": {
            "rewrite": "description",
          },
          "maximum": {
            "rewrite": "description",
          },
          "minItems": {
            "atMost": 1,
          },
          "minLength": {
            "rewrite": "description",
          },
          "minimum": {
            "rewrite": "description",
          },
          "multipleOf": {
            "rewrite": "description",
          },
          "pattern": "keep",
          "properties": "keep",
          "required": "keep",
          "title": "keep",
          "type": "keep",
        },
        "limits": [
          {
            "max": 24,
            "measure": "optional",
            "per": "request",
          },
          {
            "max": 16,
            "measure": "unions",
            "per": "request",
          },
        ],
        "read": "2026-11-18",
        "recursion": false,
        "refs": "inline",
        "rootMustBeObject": true,
        "source": "https://platform.claude.com/docs/en/build-with-claude/structured-outputs#json-schema-limitations",
      }
    `);
  });

  it('pins the gemini table', () => {
    expect(DIALECTS.get('gemini')).toMatchInlineSnapshot(`
      {
        "additionalPropertiesFalseRequired": false,
        "allRequired": false,
        "flat": false,
        "formats": [
          "date-time",
          "date",
          "time",
        ],
        "keywords": {
          "additionalProperties": "keep",
          "anyOf": "keep",
          "description": "keep",
          "enum": "keep",
          "format": "keep",
          "items": "keep",
          "maxItems": "keep",
          "maximum": "keep",
          "minItems": "keep",
          "minimum": "keep",
          "prefixItems": "keep",
          "properties": "keep",
          "required": "keep",
          "title": "keep",
          "type": "keep",
        },
        "limits": [],
        "read": "2026-11-18",
        "recursion": true,
        "refs": "keep",
        "rootMustBeObject": false,
        "source": "https://aistudio.google.com/docs/structured-output",
      }
    `);
  });

  it('pins the mcp table', () => {
    expect(DIALECTS.get('mcp')).toMatchInlineSnapshot(`
      {
        "additionalPropertiesFalseRequired": false,
        "allRequired": false,
        "flat": false,
        "keywords": {
          "$comment": "keep",
          "additionalProperties": "keep",
          "allOf": "keep",
          "anyOf": "keep",
          "const": "keep",
          "contains": "keep",
          "contentEncoding": "keep",
          "contentMediaType": "keep",
          "contentSchema": "keep",
          "default": "keep",
          "dependentRequired": "keep",
          "dependentSchemas": "keep",
          "deprecated": "keep",
          "description": "keep",
          "else": "keep",
          "enum": "keep",
          "examples": "keep",
          "exclusiveMaximum": "keep",
          "exclusiveMinimum": "keep",
          "format": "keep",
          "if": "keep",
          "items": "keep",
          "maxContains": "keep",
          "maxItems": "keep",
          "maxLength": "keep",
          "maxProperties": "keep",
          "maximum": "keep",
          "minContains": "keep",
          "minItems": "keep",
          "minLength": "keep",
          "minProperties": "keep",
          "minimum": "keep",
          "multipleOf": "keep",
          "not": "keep",
          "oneOf": "keep",
          "pattern": "keep",
          "patternProperties": "keep",
          "prefixItems": "keep",
          "properties": "keep",
          "propertyNames": "keep",
          "readOnly": "keep",
          "required": "keep",
          "then": "keep",
          "title": "keep",
          "type": "keep",
          "unevaluatedItems": "keep",
          "unevaluatedProperties": "keep",
          "uniqueItems": "keep",
          "writeOnly": "keep",
        },
        "limits": [],
        "read": "2026-11-18",
        "recursion": true,
        "refs": "keep",
        "rootMustBeObject": false,
        "source": "https://modelcontextprotocol.io/specification/2026-07-28/server/tools.md",
      }
    `);
  });

  it('pins the mcp-elicitation table', () => {
    expect(DIALECTS.get('mcp-elicitation')).toMatchInlineSnapshot(`
      {
        "additionalPropertiesFalseRequired": false,
        "allRequired": false,
        "flat": true,
        "formats": [
          "email",
          "uri",
          "date",
          "date-time",
        ],
        "keywords": {
          "anyOf": "keep",
          "const": "keep",
          "default": "keep",
          "description": "keep",
          "enum": "keep",
          "format": "keep",
          "items": "keep",
          "maxItems": "keep",
          "maxLength": "keep",
          "maximum": "keep",
          "minItems": "keep",
          "minLength": "keep",
          "minimum": "keep",
          "oneOf": "keep",
          "properties": "keep",
          "required": "keep",
          "title": "keep",
          "type": "keep",
        },
        "limits": [],
        "read": "2026-11-18",
        "recursion": false,
        "refs": "inline",
        "rootMustBeObject": true,
        "source": "https://modelcontextprotocol.io/specification/2026-07-28/client/elicitation.md",
      }
    `);
  });

  it('pins the openai table', () => {
    expect(DIALECTS.get('openai')).toMatchInlineSnapshot(`
      {
        "additionalPropertiesFalseRequired": true,
        "allRequired": true,
        "flat": false,
        "formats": [
          "date-time",
          "time",
          "date",
          "duration",
          "email",
          "hostname",
          "ipv4",
          "ipv6",
          "uuid",
        ],
        "keywords": {
          "additionalProperties": "keep",
          "anyOf": "keep",
          "const": "keep",
          "description": "keep",
          "enum": "keep",
          "exclusiveMaximum": "keep",
          "exclusiveMinimum": "keep",
          "format": "keep",
          "items": "keep",
          "maxItems": "keep",
          "maximum": "keep",
          "minItems": "keep",
          "minimum": "keep",
          "multipleOf": "keep",
          "pattern": "keep",
          "properties": "keep",
          "required": "keep",
          "title": "keep",
          "type": "keep",
        },
        "limits": [
          {
            "max": 5000,
            "measure": "properties",
            "per": "schema",
          },
          {
            "max": 10,
            "measure": "depth",
            "per": "schema",
          },
          {
            "max": 1000,
            "measure": "enum",
            "per": "schema",
          },
        ],
        "read": "2026-11-18",
        "recursion": true,
        "refs": "inline",
        "rootMustBeObject": true,
        "source": "https://developers.openai.com/api/docs/guides/structured-outputs#supported-schemas",
      }
    `);
  });

  it('pins the keywords a document carries, and the kind of each', () => {
    expect([...KEYWORDS]).toMatchInlineSnapshot(`
      [
        [
          "additionalProperties",
          "schema",
        ],
        [
          "propertyNames",
          "schema",
        ],
        [
          "items",
          "schema",
        ],
        [
          "contains",
          "schema",
        ],
        [
          "not",
          "schema",
        ],
        [
          "if",
          "schema",
        ],
        [
          "then",
          "schema",
        ],
        [
          "else",
          "schema",
        ],
        [
          "unevaluatedItems",
          "schema",
        ],
        [
          "unevaluatedProperties",
          "schema",
        ],
        [
          "contentSchema",
          "schema",
        ],
        [
          "allOf",
          "list",
        ],
        [
          "anyOf",
          "list",
        ],
        [
          "oneOf",
          "list",
        ],
        [
          "prefixItems",
          "list",
        ],
        [
          "properties",
          "map",
        ],
        [
          "patternProperties",
          "map",
        ],
        [
          "dependentSchemas",
          "map",
        ],
        [
          "type",
          "data",
        ],
        [
          "enum",
          "data",
        ],
        [
          "const",
          "data",
        ],
        [
          "required",
          "data",
        ],
        [
          "multipleOf",
          "data",
        ],
        [
          "maximum",
          "data",
        ],
        [
          "exclusiveMaximum",
          "data",
        ],
        [
          "minimum",
          "data",
        ],
        [
          "exclusiveMinimum",
          "data",
        ],
        [
          "maxLength",
          "data",
        ],
        [
          "minLength",
          "data",
        ],
        [
          "pattern",
          "data",
        ],
        [
          "maxItems",
          "data",
        ],
        [
          "minItems",
          "data",
        ],
        [
          "uniqueItems",
          "data",
        ],
        [
          "maxContains",
          "data",
        ],
        [
          "minContains",
          "data",
        ],
        [
          "maxProperties",
          "data",
        ],
        [
          "minProperties",
          "data",
        ],
        [
          "dependentRequired",
          "data",
        ],
        [
          "format",
          "data",
        ],
        [
          "contentEncoding",
          "data",
        ],
        [
          "contentMediaType",
          "data",
        ],
        [
          "title",
          "data",
        ],
        [
          "description",
          "data",
        ],
        [
          "default",
          "data",
        ],
        [
          "deprecated",
          "data",
        ],
        [
          "readOnly",
          "data",
        ],
        [
          "writeOnly",
          "data",
        ],
        [
          "examples",
          "data",
        ],
        [
          "$comment",
          "data",
        ],
      ]
    `);
  });

  it('cites the provider page and the date it was read', () => {
    for (const dialect of DIALECTS.values()) {
      expect(dialect.source).toMatch(/^https:\/\//u);
      expect(dialect.read).toBe('2026-11-18');
    }
    expect([...DIALECTS.keys()]).toEqual(['anthropic', 'gemini', 'mcp', 'mcp-elicitation', 'openai']);
  });
});
