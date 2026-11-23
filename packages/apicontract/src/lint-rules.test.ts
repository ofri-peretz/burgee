import { describe, expect, it } from 'vitest';

import { type Contract } from './core/model.js';
import { lint, type Rule } from './lint-engine.js';
import { MAX_DESCRIPTION, OVERLAP, overlapOf, rules, rulesets, wordsOf } from './lint-rules.js';
import { openapi } from './openapi.js';

const read = (document: Record<string, unknown>): Contract => openapi.read({ openapi: '3.1.0', info: { title: 't', version: '1', description: 'd' }, ...document });

/** The messages one rule gives on a document, each with its pointer. */
const run = (id: string, contract: Contract): string[] =>
  lint([{ file: 'f', contract }], rules, { [id]: 'warn' }).findings.map((finding) => `${finding.pointer} ${finding.message}`);

const op = (extra: Record<string, unknown> = {}) => ({ operationId: 'a', tags: ['t'], description: 'd', responses: { '200': { description: 'ok' } }, ...extra });

const nullable = (version: string) =>
  openapi.read({
    openapi: version,
    info: { title: 't', version: '1' },
    paths: { '/a': { get: op({ responses: { '200': { description: 'ok', content: { 'application/json': { schema: { type: 'string', nullable: true, example: null } } } } } }) } },
  });

describe('the rulesets', () => {
  it('name only rules that exist, all at warn', () => {
    for (const ruleset of Object.values(rulesets)) {
      for (const [id, level] of Object.entries(ruleset)) {
        expect(rules[id], id).toBeDefined();
        expect(level).toBe('warn');
      }
    }
    expect(Object.keys(rulesets)).toEqual(['recommended', 'agent-ready']);
  });

  it('give every rule a description and a fix', () => {
    for (const rule of Object.values(rules) as Rule[]) {
      expect(rule.description.length).toBeGreaterThan(0);
      expect(rule.fix.length).toBeGreaterThan(0);
    }
  });
});

describe('rules', () => {
  it('reads the HTTP rules on Swagger 2 too, and info-description on AsyncAPI', () => {
    const swagger = openapi.read({ openapi: '3.1.0', info: { title: 't', version: '1' }, paths: { '/a': { get: op({ operationId: undefined }) } } });
    const asSwagger: Contract = { ...swagger, format: 'swagger2' };
    expect(run('operation-operation-id', asSwagger)).toEqual(['#/paths/~1a/get `operationId` is missing']);
    expect(run('info-description', asSwagger)).toEqual(['# `info.description` is missing']);
    expect(run('info-description', { ...swagger, format: 'asyncapi' })).toEqual(['# `info.description` is missing']);
    expect(run('info-description', { ...swagger, format: 'mcp' })).toEqual([]);
  });

  it('describes the overlap rule by its threshold', () => {
    expect(rules['description-overlap']?.description).toBe('No two operations are described in words an agent cannot tell apart (80% shared or more)');
  });

  it('operation-operation-id', () => {
    expect(run('operation-operation-id', read({ paths: { '/a': { get: op({ operationId: undefined }) } } }))).toEqual(['#/paths/~1a/get `operationId` is missing']);
    expect(run('operation-operation-id', read({ paths: { '/a': { get: op() } } }))).toEqual([]);
  });

  it('operation-operation-id-unique counts each repeated id once', () => {
    const repeated = read({ paths: { '/a': { get: op(), put: op(), post: op() }, '/b': { get: op({ operationId: 'b' }), put: op({ operationId: undefined }), post: op({ operationId: undefined }) } } });
    expect(run('operation-operation-id-unique', repeated)).toEqual(['# operationId `a` is used more than once']);
    expect(run('operation-operation-id-unique', read({ paths: { '/a': { get: op() } } }))).toEqual([]);
  });

  it('operation-description takes a description or a summary, not blank text', () => {
    const contract = read({ paths: { '/a': { get: op({ description: '  ' }), put: op({ description: undefined, summary: 's' }), post: op({ description: undefined }) } } });
    expect(run('operation-description', contract)).toEqual(['#/paths/~1a/get has no description or summary', '#/paths/~1a/post has no description or summary']);
  });

  it('operation-tags', () => {
    expect(run('operation-tags', read({ paths: { '/a': { get: op({ tags: [] }), put: op({ tags: undefined }) } } }))).toEqual([
      '#/paths/~1a/get `tags` has 0, fewer than 1',
      '#/paths/~1a/put `tags` is missing',
    ]);
  });

  it('operation-success-response takes 2xx, 3xx and their ranges', () => {
    const contract = read({
      paths: {
        '/a': {
          get: op({ responses: { '404': { description: 'x' }, default: { description: 'x' } } }),
          put: op({ responses: { '3XX': { description: 'x' } } }),
          post: op({ responses: { '302': { description: 'x' } } }),
          patch: op({ responses: { '2000': { description: 'x' }, '1200': { description: 'x' } } }),
          delete: op({ responses: undefined }),
        },
      },
    });
    expect(run('operation-success-response', contract)).toEqual([
      '#/paths/~1a/delete declares no 2xx or 3xx response',
      '#/paths/~1a/get declares no 2xx or 3xx response',
      '#/paths/~1a/patch declares no 2xx or 3xx response',
    ]);
  });

  it('parameter-description and property-description', () => {
    const contract = read({
      paths: {
        '/a': {
          get: op({
            parameters: [
              { name: 'q', in: 'query', schema: { type: 'string' } },
              { name: 'r', in: 'query', description: 'r', schema: { type: 'string' } },
            ],
            responses: { '200': { description: 'ok', content: { 'application/json': { schema: { type: 'object', properties: { n: { type: 'string' }, m: { type: 'string', description: 'm' } } } } } } },
          }),
        },
      },
    });
    expect(run('parameter-description', contract)).toEqual(['#/paths/~1a/get/parameters/0 q: `description` is missing']);
    expect(run('property-description', contract)).toEqual(['#/paths/~1a/get response:200:application/json/properties/n n: `description` is missing']);
  });

  it('info-description', () => {
    expect(run('info-description', openapi.read({ openapi: '3.1.0', info: { title: 't', version: '1' }, paths: {} }))).toEqual(['# `info.description` is missing']);
    expect(run('info-description', read({ paths: {} }))).toEqual([]);
  });

  it('no-unresolved-ref names each dangling local reference once, and leaves other files alone', () => {
    const contract = read({
      paths: {},
      components: {
        schemas: {
          A: { description: '#/not/a/ref', properties: { x: { $ref: '#/components/schemas/Gone' }, y: { $ref: '#/components/schemas/Gone' }, z: { $ref: 'other.yaml#/A' }, w: { $ref: '#/components/schemas/A' } } },
          B: { allOf: [{ $ref: '#/components/schemas/InList' }], default: null },
        },
      },
      'x-list': [{ $ref: 7 }],
    });
    expect(run('no-unresolved-ref', contract)).toEqual(['# `#/components/schemas/Gone` points at nothing', '# `#/components/schemas/InList` points at nothing']);
  });

  it('no-unused-component sees references to a schema and into it, with escaped names', () => {
    const contract = read({
      paths: {},
      components: {
        schemas: {
          'a/b': { type: 'string' },
          'c~d': { type: 'string' },
          Into: { $defs: { X: { type: 'string' } } },
          Prefix: { type: 'string' },
          PrefixLonger: { $ref: '#/components/schemas/a~1b' },
          User: { properties: { into: { $ref: '#/components/schemas/Into/$defs/X' }, c: { $ref: '#/components/schemas/c~0d' }, p: { $ref: '#/components/schemas/PrefixLonger' } } },
        },
      },
    });
    expect(run('no-unused-component', contract)).toEqual(['# `components.schemas.Prefix` is never used', '# `components.schemas.User` is never used']);
    expect(run('no-unused-component', read({ paths: {} }))).toEqual([]);
  });

  it('path-no-trailing-slash spares the root', () => {
    expect(run('path-no-trailing-slash', read({ paths: { '/': {}, '/a/': {}, '/b': {} } }))).toEqual(['# path `/a/` ends with a slash']);
  });

  it('example-valid checks example and examples against their own schema, references followed', () => {
    const contract = read({
      paths: {
        '/a': {
          get: op({
            responses: {
              '200': {
                description: 'ok',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        n: { type: 'integer', example: 'x', description: 'n' },
                        m: { type: 'string', examples: ['ok', 2] },
                        r: { $ref: '#/components/schemas/R', example: 'not a number' },
                        loop: { $ref: '#/components/schemas/Loop', example: 1 },
                        far: { $ref: 'other.yaml#/X', example: 1 },
                        both: { type: 'object', properties: { a: { $ref: 'a.yaml' }, b: { $ref: 'b.yaml' } }, example: {} },
                        lost: { $ref: '#/nowhere', example: 1 },
                        good: { type: 'string', example: 'fine' },
                        none: { type: 'string', examples: 'not a list' },
                      },
                    },
                  },
                },
              },
            },
          }),
        },
      },
      components: { schemas: { R: { type: 'number' }, Loop: { type: 'object', properties: { next: { $ref: '#/components/schemas/Loop' } }, example: 'not an object' } } },
    });
    expect(run('example-valid', contract)).toEqual([
      '#/components/schemas/Loop example cannot be checked: its schema reaches #/components/schemas/Loop, which repeats or is in another file',
      '#/components/schemas/R example "not a number" is not valid against its schema',
      '#/paths/~1a/get response:200:application/json/properties/both example cannot be checked: its schema reaches a.yaml, b.yaml, which repeats or is in another file',
      '#/paths/~1a/get response:200:application/json/properties/far example cannot be checked: its schema reaches other.yaml#/X, which repeats or is in another file',
      '#/paths/~1a/get response:200:application/json/properties/m example 2 is not valid against its schema',
      '#/paths/~1a/get response:200:application/json/properties/n example "x" is not valid against its schema',
    ]);
  });

  it('example-valid reads OpenAPI 3.0 and Swagger 2 schemas as OpenAPI 3.0, and reports a schema it cannot read', () => {
    expect(run('example-valid', nullable('3.0.3'))).toEqual([]);
    expect(run('example-valid', nullable('3.1.0'))).toEqual(['#/paths/~1a/get response:200:application/json example null is not valid against its schema']);
    const swagger: Contract = { ...nullable('3.0.3'), document: { swagger: '2.0' } };
    expect(run('example-valid', swagger)).toEqual([]);
    const broken = read({ paths: { '/a': { get: op({ responses: { '200': { description: 'ok', content: { 'application/json': { schema: { type: 'string', pattern: '(', example: 'x' } } } } } }) } } });
    expect(run('example-valid', broken)[0]).toMatch(/^#\/paths\/~1a\/get response:200:application\/json example cannot be checked: /u);
  });

  it('example-valid reads a document with no openapi version as JSON Schema 2020-12', () => {
    const tool: Contract = { format: 'mcp', document: { tools: [] }, operations: [{ id: 't', source: '#/tools/0', payloads: [{ name: 'arguments', direction: 'tool-call', required: true, schema: { type: 'string', example: 3 } }] }] };
    expect(run('example-valid', tool)).toEqual(['#/tools/0 arguments example 3 is not valid against its schema']);
  });

  it(`description-length allows ${String(MAX_DESCRIPTION)} characters, not one more, of the description or else the summary`, () => {
    const contract = read({
      paths: {
        '/a': {
          get: op({ description: 'x'.repeat(MAX_DESCRIPTION) }),
          put: op({ description: ` ${'x'.repeat(MAX_DESCRIPTION + 1)}` }),
          post: op({ description: undefined, summary: 'y'.repeat(MAX_DESCRIPTION + 2) }),
        },
      },
    });
    expect(run('description-length', contract)).toEqual(['#/paths/~1a/post description has 302 characters, more than 300', '#/paths/~1a/put description has 301 characters, more than 300']);
  });

  it(`description-overlap flags a later operation sharing ${String(OVERLAP * 100)}% of its words with an earlier one`, () => {
    const contract = read({
      paths: {
        '/a': {
          get: op({ operationId: 'first', description: 'Return every order placed today' }),
          put: op({ operationId: 'second', description: 'return EVERY order placed today!' }),
          post: op({ operationId: 'third', description: 'Create one order for a customer' }),
          patch: op({ operationId: 'fourth', description: 'Return every order placed this week' }),
          head: op({ operationId: 'sixth', description: 'alpha bravo charlie delta' }),
          options: op({ operationId: 'seventh', description: 'alpha bravo charlie delta echoes' }),
          delete: op({ operationId: 'fifth', description: 'a b c' }),
        },
      },
    });
    expect(run('description-overlap', contract)).toEqual(['#/paths/~1a/head description shares 80% of its words with `seventh`', '#/paths/~1a/put description shares 100% of its words with `first`']);
  });

  it('description-overlap compares an operation it cannot place in the contract with nothing, not with all but the last', () => {
    const contract = read({
      paths: { '/a': { get: op({ operationId: 'first', description: 'Return every order placed today' }), put: op({ operationId: 'second', description: 'Create one order' }) } },
    });
    const stranger = { id: 'x', source: '#/paths/~1b/get', payloads: [] };
    const check = (rules['description-overlap'] as Rule).check as NonNullable<Rule['check']>;
    expect(check({ pointer: '#/paths/~1b/get', value: { description: 'Return every order placed today' }, operation: stranger }, { contract })).toEqual([]);
  });

  it('measures overlap as shared words over all words, ignoring short ones', () => {
    expect([...wordsOf('The cat, the CAT and a dog-house 42x')]).toEqual(['house']);
    expect(overlapOf(new Set(['a', 'b', 'c', 'd']), new Set(['a', 'b', 'c', 'e']))).toBe(3 / 5);
    expect(overlapOf(new Set(), new Set(['a']))).toBe(0);
    expect(overlapOf(new Set(['a']), new Set())).toBe(0);
    expect(overlapOf(new Set(), new Set())).toBe(0);
    expect(overlapOf(new Set(['a']), new Set(['a']))).toBe(1);
  });
});
