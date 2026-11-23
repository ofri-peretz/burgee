import { describe, expect, it } from 'vitest';

import { type Contract } from './core/model.js';
import { LEVELS, lint, problemsOf, type Rule } from './lint-engine.js';
import { methodOf, select, SELECTS } from './lint-select.js';
import { openapi } from './openapi.js';

const contract = (document: Record<string, unknown>): Contract => openapi.read({ openapi: '3.1.0', info: { title: 't', version: '1' }, ...document });

const twoOperations = contract({
  paths: {
    '/a': { get: { operationId: 'a', tags: ['x'], responses: { '200': { description: 'ok', content: { 'application/json': { schema: { type: 'object', properties: { n: { type: 'string' } } } } } } } } },
    '/b': { post: { operationId: 'b', tags: ['y'], responses: { '201': { description: 'ok' } } } },
  },
});

const ids = (given: Parameters<typeof select>[1]) => select(twoOperations, given).map((node) => node.operation?.id);

describe('select', () => {
  it('knows five selectors', () => {
    expect(SELECTS).toEqual(['document', 'operation', 'parameter', 'property', 'schema']);
  });

  it('selects nothing from a format the given does not name', () => {
    expect(select(twoOperations, { select: 'document', formats: ['mcp'] })).toEqual([]);
    expect(select(twoOperations, { select: 'document', formats: ['openapi'] })).toHaveLength(1);
  });

  it('selects the document at #', () => {
    expect(select(twoOperations, { select: 'document' })).toEqual([{ pointer: '#', value: twoOperations.document }]);
  });

  it('selects operations by tag and by method, either case', () => {
    expect(ids({ select: 'operation' })).toEqual(['a', 'b']);
    expect(ids({ select: 'operation', tag: 'y' })).toEqual(['b']);
    expect(ids({ select: 'operation', method: 'get' })).toEqual(['a']);
    expect(ids({ select: 'operation', method: 'POST', tag: 'x' })).toEqual([]);
    expect(select(twoOperations, { select: 'operation', tag: 'x' })[0]?.value).toMatchObject({ operationId: 'a' });
  });

  it('reads the method only from #/paths/<path>/<method>', () => {
    expect(methodOf({ id: 'x', source: '#/paths/~1a/get', payloads: [] })).toBe('GET');
    expect(methodOf({ id: 'x', source: '#/webhooks/a/get', payloads: [] })).toBeUndefined();
    expect(methodOf({ id: 'x', source: '#/paths/a', payloads: [] })).toBeUndefined();
  });

  it('selects each parameter once, at its own pointer, a referenced one at its target', () => {
    const shared = contract({
      paths: {
        '/a': {
          parameters: [{ $ref: '#/components/parameters/P' }, { $ref: '#/components/parameters/P' }],
          get: { operationId: 'a', parameters: [{ name: 'q', in: 'query', description: 'd' }], responses: {} },
          put: { operationId: 'b', parameters: 'not a list', responses: {} },
        },
      },
      components: { parameters: { P: { name: 'p', in: 'header' } } },
    });
    expect(select(shared, { select: 'parameter' }).map((node) => [node.pointer, node.name, node.operation?.id])).toEqual([
      ['#/components/parameters/P', 'p', 'a'],
      ['#/paths/~1a/get/parameters/0', 'q', 'a'],
    ]);
  });

  it('walks every schema once, follows local references, and names properties', () => {
    const walked = contract({
      paths: {
        '/a': {
          get: {
            operationId: 'a',
            responses: {
              '200': { description: 'ok', content: { 'application/json': { schema: { $ref: '#/components/schemas/A' } } } },
              '201': { description: 'ok', content: { 'application/json': { schema: { $ref: '#/components/schemas/A' } } } },
            },
          },
        },
      },
      components: {
        schemas: {
          A: {
            type: 'object',
            properties: { 'x/y': { $ref: '#/components/schemas/B', description: 'beside' }, self: { $ref: '#/components/schemas/A' }, lost: { $ref: '#/nowhere' }, odd: { $ref: 'other.yaml#/X' } },
            allOf: [{ type: 'object' }, 'not a schema'],
            items: { type: 'string' },
            $defs: { D: { type: 'integer' } },
            anyOf: 'not a list',
            not: [{ type: 'string' }],
            contains: null,
            patternProperties: 'not a map',
          },
          B: { type: 'string', description: 'own' },
        },
      },
    });
    expect(select(walked, { select: 'schema' }).map((node) => node.pointer)).toEqual([
      '#/components/schemas/A',
      '#/components/schemas/A/items',
      '#/components/schemas/A/allOf/0',
      '#/components/schemas/B',
      '#/components/schemas/A/properties/lost',
      '#/components/schemas/A/properties/odd',
      '#/components/schemas/A/$defs/D',
    ]);
    const properties = select(walked, { select: 'property' });
    expect(properties.map((node) => [node.pointer, node.name, node.value.description])).toEqual([
      ['#/components/schemas/B', 'x/y', 'beside'],
      ['#/components/schemas/A/properties/lost', 'lost', undefined],
      ['#/components/schemas/A/properties/odd', 'odd', undefined],
    ]);
    expect(properties[0]?.value.type).toBe('string');
  });

  it('walks every keyword that holds a schema, and nothing that is not one', () => {
    const one = ['items', 'additionalProperties', 'not', 'contains', 'if', 'then', 'else', 'propertyNames', 'unevaluatedItems', 'unevaluatedProperties'];
    const list = ['allOf', 'anyOf', 'oneOf', 'prefixItems'];
    const map = ['properties', 'patternProperties', '$defs', 'definitions', 'dependentSchemas'];
    const schema = Object.fromEntries([
      ...one.map((keyword) => [keyword, { type: 'string' }]),
      ...list.map((keyword) => [keyword, [{ type: 'string' }]]),
      ...map.map((keyword) => [keyword, { 'a~b/c': { type: 'string' } }]),
      ['x-other', { type: 'string' }],
      ['const', ['not', 'a schema']],
    ]);
    const walked = contract({ paths: { '/a': { get: { operationId: 'a', responses: { '200': { description: 'ok', content: { 'application/json': { schema: { $ref: '#/components/schemas/S' } } } } } } } }, components: { schemas: { S: schema } } });
    const at = '#/components/schemas/S';
    expect(select(walked, { select: 'schema' }).map((node) => node.pointer)).toEqual([
      at,
      ...one.map((keyword) => `${at}/${keyword}`),
      ...list.map((keyword) => `${at}/${keyword}/0`),
      ...map.map((keyword) => `${at}/${keyword}/a~0b~1c`),
    ]);
    expect(select(walked, { select: 'property' }).map((node) => node.name)).toEqual(['a~b/c']);
  });

  it('stops on references that only point at each other', () => {
    const loop = contract({
      paths: { '/a': { get: { operationId: 'a', responses: { '200': { description: 'ok', content: { 'application/json': { schema: { type: 'object', properties: { p: { $ref: '#/components/schemas/X' } } } } } } } } } },
      components: { schemas: { X: { $ref: '#/components/schemas/Y' }, Y: { $ref: '#/components/schemas/X' } } },
    });
    expect(select(loop, { select: 'property' }).map((node) => node.pointer)).toEqual(['#/components/schemas/Y']);
  });

  it('gives an inline schema a logical pointer: the operation, the payload, then the path', () => {
    expect(select(twoOperations, { select: 'property' }).map((node) => node.pointer)).toEqual(['#/paths/~1a/get response:200:application/json/properties/n']);
  });
});

describe('lint', () => {
  const rules: Record<string, Rule> = {
    described: { description: 'd', given: { select: 'operation' }, then: { field: 'description', function: 'truthy' }, fix: 'describe it' },
    tagged: { description: 't', given: { select: 'operation' }, then: [{ field: 'tags', function: 'length', functionOptions: { min: 2 } }, { field: 'tags.0', function: 'pattern', functionOptions: { match: '^y' } }], fix: 'tag it' },
    named: { description: 'n', given: { select: 'property' }, check: (node) => [`checked ${node.pointer.length > 0 ? 'one' : 'none'}`], fix: 'name it' },
    whole: { description: 'w', given: { select: 'document' }, then: { function: 'truthy' }, fix: 'nothing' },
  };

  it('knows three levels', () => {
    expect(LEVELS).toEqual(['error', 'warn', 'off']);
  });

  it('runs each rule not off, in id order, and sorts findings by level, file, pointer and rule', () => {
    const result = lint(
      [
        { file: 'b.yaml', contract: twoOperations },
        { file: 'a.yaml', contract: twoOperations },
      ],
      rules,
      { tagged: 'warn', described: 'error', named: 'warn', whole: 'off', absent: 'error' },
    );
    expect(result.inputs).toEqual(['b.yaml', 'a.yaml']);
    expect(result.counts).toEqual({ described: { checked: 4, failed: 4 }, named: { checked: 2, failed: 2 }, tagged: { checked: 4, failed: 4 } });
    expect(result.findings.map((finding) => [finding.level, finding.file, finding.pointer, finding.rule])).toEqual([
      ['error', 'a.yaml', '#/paths/~1a/get', 'described'],
      ['error', 'a.yaml', '#/paths/~1b/post', 'described'],
      ['error', 'b.yaml', '#/paths/~1a/get', 'described'],
      ['error', 'b.yaml', '#/paths/~1b/post', 'described'],
      ['warn', 'a.yaml', '#/paths/~1a/get', 'tagged'],
      ['warn', 'a.yaml', '#/paths/~1a/get', 'tagged'],
      ['warn', 'a.yaml', '#/paths/~1a/get response:200:application/json/properties/n', 'named'],
      ['warn', 'a.yaml', '#/paths/~1b/post', 'tagged'],
      ['warn', 'b.yaml', '#/paths/~1a/get', 'tagged'],
      ['warn', 'b.yaml', '#/paths/~1a/get', 'tagged'],
      ['warn', 'b.yaml', '#/paths/~1a/get response:200:application/json/properties/n', 'named'],
      ['warn', 'b.yaml', '#/paths/~1b/post', 'tagged'],
    ]);
    expect(result.findings.filter((finding) => finding.file === 'a.yaml' && finding.rule !== 'described').map((finding) => finding.message)).toEqual([
      '`tags` has 1, fewer than 2',
      '`tags.0` "x" does not match ^y',
      'n: checked one',
      '`tags` has 1, fewer than 2',
    ]);
    expect(result.findings[0]).toEqual({ rule: 'described', level: 'error', file: 'a.yaml', pointer: '#/paths/~1a/get', message: '`description` is missing', fix: 'describe it' });
  });

  it('applies a function to the node itself when no field is named, and reads a dotted path through non-objects as missing', () => {
    const context = { contract: twoOperations };
    expect(problemsOf({ ...(rules.whole as Rule) }, { pointer: '#', value: {} }, context)).toEqual([]);
    expect(problemsOf({ description: 'd', given: { select: 'document' }, then: { field: 'a.b.c', function: 'defined' }, fix: 'f' }, { pointer: '#', value: { a: 'text' } }, context)).toEqual(['`a.b.c` is missing']);
    expect(problemsOf({ description: 'd', given: { select: 'document' }, then: { field: 'a.b', function: 'defined' }, fix: 'f' }, { pointer: '#', value: { a: { b: 0 } } }, context)).toEqual([]);
    expect(problemsOf({ description: 'd', given: { select: 'document' }, then: { field: 'a.b', function: 'defined' }, fix: 'f' }, { pointer: '#', value: { a: null } }, context)).toEqual(['`a.b` is missing']);
    expect(problemsOf({ description: 'd', given: { select: 'document' }, fix: 'f' }, { pointer: '#', value: {} }, context)).toEqual([]);
    expect(problemsOf({ description: 'd', given: { select: 'document' }, then: { function: 'falsy' }, fix: 'f' }, { pointer: '#', value: { a: 1 } }, context)).toEqual(['is {"a":1}']);
  });
});
