import { readFileSync } from 'node:fs';

import { parse } from 'seniority/yaml';
import { describe, expect, it } from 'vitest';

import { type Contract, type Direction, type Operation, type Payload } from './core/model.js';
import { compareContracts, type Finding, routeOf } from './diff-contract.js';
import { read } from './openapi.js';

const fixture = (name: string): Contract => read(parse(readFileSync(new URL(`__fixtures__/diff/${name}`, import.meta.url), 'utf8')));

const rows = (findings: readonly Finding[]) => findings.map((f) => [f.verdict, f.id, f.operation, f.payload ?? '', f.pointer]);

const payload = (name: string, direction: Direction, schema: Payload['schema'] = { type: 'string' }, required = true): Payload => ({ name, direction, schema, required });
const op = (id: string, payloads: Payload[], source = `#/x/${id}`): Operation => ({ id, source, payloads });
const contract = (operations: Operation[], format = 'mcp'): Contract => ({ format, document: {}, operations });

const pairOf = (before: Payload[], after: Payload[]) => compareContracts(contract([op('o', before, '#/paths/~1a/get')], 'openapi'), contract([op('o', after, '#/paths/~1a/get')], 'openapi'));
const doc = (type: string) => ({ components: { schemas: { A: { type } } } });
const side = (type: string): Contract => ({
  format: 'openapi',
  document: doc(type),
  operations: [op('o', [payload('body:application/json', 'request', { $ref: '#/components/schemas/A' })])],
});
const tool = (input: Payload['schema'], result: Payload['schema']) => op('search', [payload('arguments', 'tool-call', input), payload('result', 'tool-result', result)]);
const answerFirst = op('t', [payload('result', 'tool-result'), payload('arguments', 'tool-call')]);
const channel = (payloads: Payload[]) => contract([op('c', payloads)], 'asyncapi');

const body = (schema: Payload['schema']) => payload('body:application/json', 'request', schema);

describe('compareContracts on two OpenAPI documents', () => {
  it('finds the planted changes, breaking first, an operation matched by route when its id and path parameter were renamed', () => {
    const result = compareContracts(fixture('pets-old.yaml'), fixture('pets-new.yaml'));
    expect(rows(result.findings)).toEqual([
      ['breaking', 'request-property-max-length-decreased', 'addPet', 'body:application/json', '/properties/name/maxLength'],
      ['breaking', 'response-property-enum-value-added', 'addPet', 'response:201:application/json', '/properties/kind'],
      ['breaking', 'api-removed-without-deprecation', 'deletePet', '', ''],
      ['breaking', 'response-property-enum-value-added', 'fetchPet', 'response:200:application/json', '/properties/kind'],
      ['non-breaking', 'request-property-enum-value-added', 'addPet', 'body:application/json', '/properties/kind'],
      ['non-breaking', 'response-optional-property-added', 'addPet', 'response:201:application/json', '/properties/age'],
      ['non-breaking', 'response-optional-property-added', 'fetchPet', 'response:200:application/json', '/properties/age'],
    ]);
    expect(result).toMatchObject({ mode: 'backward', side: 'caller', verdict: 'breaking', summary: { breaking: 4, unknown: 0, 'non-breaking': 3 } });
    expect(result.findings[2]).toStrictEqual({
      id: 'api-removed-without-deprecation',
      scheme: 'oasdiff',
      verdict: 'breaking',
      effect: 'narrows',
      operation: 'deletePet',
      source: '#/paths/~1pets~1{id}/delete',
      document: 'old',
      direction: 'request',
      pointer: '',
      before: 'deletePet',
      after: undefined,
      fix: 'keep accepting at deletePet what the old contract accepted, or release this as a major version',
    });
    expect(result.findings[1]).toMatchObject({ document: 'new', fix: 'keep addPet response:201:application/json /properties/kind within what the old contract allowed, or release this as a major version' });
    expect(result.findings[4]?.fix).toBe('nothing to do');
  });

  it('reversed under forward, the same documents break the same places: reversing a diff swaps the modes', () => {
    const result = compareContracts(fixture('pets-new.yaml'), fixture('pets-old.yaml'), { mode: 'forward' });
    expect(result).toMatchObject({ mode: 'forward', side: 'caller' });
    expect(compareContracts(fixture('pets-new.yaml'), fixture('pets-old.yaml'), { mode: 'backward', side: 'server' }).findings).toEqual(result.findings);
    expect(rows(result.findings).filter(([verdict]) => verdict === 'breaking')).toEqual([
      ['breaking', 'ac-maxLength-increased', 'addPet', 'body:application/json', '/properties/name/maxLength'],
      ['breaking', 'response-property-enum-value-removed', 'addPet', 'response:201:application/json', '/properties/kind'],
      ['breaking', 'endpoint-added', 'deletePet', '', ''],
      ['breaking', 'response-property-enum-value-removed', 'getPet', 'response:200:application/json', '/properties/kind'],
    ]);
  });

  it('reports nothing for a document compared with itself', () => {
    expect(compareContracts(fixture('pets-old.yaml'), fixture('pets-old.yaml'))).toEqual({
      mode: 'backward',
      side: 'caller',
      verdict: 'non-breaking',
      summary: { breaking: 0, unknown: 0, 'non-breaking': 0 },
      findings: [],
    });
  });
});

describe('payloads', () => {

  it.each([
    ['an optional parameter added', [], [payload('param:query:q', 'request', {}, false)], { verdict: 'non-breaking', id: 'new-optional-request-parameter', effect: 'neutral' }],
    ['a required parameter added', [], [payload('param:query:q', 'request')], { verdict: 'breaking', id: 'new-required-request-parameter', effect: 'narrows' }],
    ['an optional parameter removed', [payload('param:query:q', 'request', {}, false)], [], { verdict: 'non-breaking', id: 'request-parameter-removed', effect: 'neutral' }],
    ['a required parameter removed', [payload('param:query:q', 'request')], [], { verdict: 'non-breaking', id: 'request-parameter-removed', effect: 'widens' }],
    ['a parameter made required', [payload('param:query:q', 'request', {}, false)], [payload('param:query:q', 'request', {})], { verdict: 'breaking', id: 'request-parameter-became-required', effect: 'narrows' }],
    ['a body made optional', [payload('body:application/json', 'request')], [payload('body:application/json', 'request', { type: 'string' }, false)], { verdict: 'non-breaking', id: 'request-body-became-optional', effect: 'widens' }],
    ['a body media type added', [payload('body:application/json', 'request')], [payload('body:application/json', 'request'), payload('body:text/plain', 'request')], { verdict: 'non-breaking', id: 'request-body-media-type-added', effect: 'widens' }],
    ['a body media type removed', [payload('body:application/json', 'request'), payload('body:text/plain', 'request')], [payload('body:application/json', 'request')], { verdict: 'breaking', id: 'request-body-media-type-removed', effect: 'narrows' }],
    ['the whole body removed', [payload('body:application/json', 'request')], [], { verdict: 'breaking', id: 'ac-request-body-removed', effect: 'narrows' }],
    ['the whole body added', [], [payload('body:application/json', 'request')], { verdict: 'non-breaking', id: 'ac-request-body-added', effect: 'widens' }],
    ['a response status removed', [payload('response:200:application/json', 'response')], [], { verdict: 'non-breaking', id: 'response-success-status-removed', effect: 'narrows' }],
    ['a response status added', [], [payload('response:400:application/json', 'response')], { verdict: 'breaking', id: 'response-success-status-added', effect: 'widens' }],
    ['a response media type added', [payload('response:200:application/json', 'response')], [payload('response:200:application/json', 'response'), payload('response:200:text/plain', 'response')], { verdict: 'breaking', id: 'response-media-type-added', effect: 'widens' }],
    ['a response media type removed', [payload('response:200:application/json', 'response'), payload('response:200:text/plain', 'response')], [payload('response:200:application/json', 'response')], { verdict: 'non-breaking', id: 'response-media-type-removed', effect: 'narrows' }],
  ])('%s', (_name, before, after, expected) => {
    const [finding] = pairOf(before, after).findings;
    expect(finding).toMatchObject({ ...expected, pointer: '' });
  });

  it('a status or body is whole when nothing else of its group is left', () => {
    const json = payload('response:200:application/json', 'response');
    const added = pairOf([json], [json, payload('response:400:application/json', 'response', { type: 'integer' })]).findings;
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ id: 'response-success-status-added', after: { type: 'integer' } });
    const query = payload('param:query:q', 'request', {}, false);
    expect(pairOf([payload('body:application/json', 'request'), query], [query]).findings.map((f) => f.id)).toEqual(['ac-request-body-removed']);
  });

  it('pairs only the path parameters one side lacks', () => {
    const before = [payload('param:path:a', 'request'), payload('param:path:b', 'request')];
    const after = [payload('param:path:a', 'request', { type: 'integer' }), payload('param:path:c', 'request', { type: 'integer' })];
    expect(rows(pairOf(before, after).findings).map((row) => row[3])).toEqual(['param:path:a', 'param:path:c', 'param:path:a', 'param:path:c']);
  });

  it('lists breaking first, then unknown, then non-breaking, whatever their place', () => {
    const result = pairOf(
      [body({ properties: { a: { enum: [1] }, b: { multipleOf: 2 }, c: { maxLength: 1 } } })],
      [body({ properties: { a: { enum: [1, 2] }, b: { multipleOf: 3 }, c: { maxLength: 0 } } })],
    );
    expect(result.findings.map((f) => [f.verdict, f.pointer])).toEqual([
      ['breaking', '/properties/c/maxLength'],
      ['unknown', '/properties/b/multipleOf'],
      ['non-breaking', '/properties/a'],
    ]);
  });

  it('a payload that sends nothing is no payload: content added to a 204 is one media type added', () => {
    expect(rows(pairOf([payload('response:204', 'response', false)], [payload('response:204:application/json', 'response')]).findings)).toEqual([
      ['breaking', 'response-media-type-added', 'o', 'response:204:application/json', ''],
    ]);
    expect(pairOf([payload('response:204:application/json', 'response')], [payload('response:204', 'response', false)]).findings.map((f) => f.id)).toEqual(['response-media-type-removed']);
  });

  it('pairs renamed path parameters in order, and reports the ones left over', () => {
    const before = [payload('param:path:a', 'request'), payload('param:path:b', 'request', { type: 'string' })];
    const after = [payload('param:path:x', 'request', { type: 'integer' })];
    expect(rows(pairOf(before, after).findings)).toEqual([
      ['breaking', 'request-parameter-type-changed', 'o', 'param:path:x', ''],
      ['non-breaking', 'request-parameter-removed', 'o', 'param:path:b', ''],
      ['non-breaking', 'request-parameter-type-changed', 'o', 'param:path:x', ''],
    ]);
    expect(rows(pairOf(after, before).findings).map((row) => row[1])).toEqual(['request-parameter-type-changed', 'new-required-request-parameter', 'request-parameter-type-changed']);
  });

  it('a changed keyword it cannot judge is unknown, with a fix that says to look', () => {
    const result = pairOf([payload('body:application/json', 'request', { multipleOf: 2 })], [payload('body:application/json', 'request', { multipleOf: 3 })]);
    expect(result).toMatchObject({ verdict: 'unknown', summary: { breaking: 0, unknown: 1, 'non-breaking': 0 } });
    expect(result.findings[0]).toMatchObject({
      id: 'ac-keyword-changed',
      fix: 'review o body:application/json /multipleOf by hand: apicontract cannot tell what `keyword-changed` does to the values it accepts',
    });
  });

  it('resolves references in each side against its own document', () => {
    expect(rows(compareContracts(side('string'), side('integer')).findings).map((row) => row[1])).toEqual(['request-body-type-changed', 'request-body-type-changed']);
  });
});

describe('other families, on hand-built contracts', () => {
  it('an MCP tool: a narrower input and a wider result both break callers, under our ids', () => {
    const result = compareContracts(contract([tool({ type: 'string' }, { enum: ['a'] })]), contract([tool({ type: 'string', maxLength: 3 }, { enum: ['a', 'b'] })]));
    expect(rows(result.findings)).toEqual([
      ['breaking', 'ac-maxLength-set', 'search', 'arguments', '/maxLength'],
      ['breaking', 'ac-enum-value-added', 'search', 'result', ''],
    ]);
  });

  it('an operation is added or removed in the direction it is called in', () => {
    const removed = compareContracts(contract([answerFirst]), contract([]));
    expect(removed.findings[0]).toMatchObject({ id: 'ac-operation-removed', direction: 'tool-call', verdict: 'breaking', document: 'old', source: '#/x/t' });
    const published = op('p', [payload('message', 'publish')]);
    expect(compareContracts(contract([]), contract([published])).findings[0]).toMatchObject({ id: 'ac-operation-added', direction: 'subscribe', verdict: 'non-breaking' });
    expect(compareContracts(contract([published]), contract([])).findings[0]).toMatchObject({ id: 'ac-operation-removed', direction: 'subscribe', verdict: 'breaking' });
    expect(compareContracts(contract([op('g', [payload('response:200', 'response')], '#/q')]), contract([])).findings[0]).toMatchObject({ id: 'api-removed-without-deprecation', direction: 'request' });
    expect(compareContracts(contract([op('e', [])]), contract([])).findings[0]).toMatchObject({ id: 'api-removed-without-deprecation', direction: 'request' });
  });

  it('an AsyncAPI message: a payload added, removed or made required, under our ids', () => {
    expect(rows(compareContracts(channel([]), channel([payload('message', 'subscribe')])).findings)).toEqual([['non-breaking', 'ac-payload-added', 'c', 'message', '']]);
    expect(rows(compareContracts(channel([payload('message', 'publish')]), channel([])).findings)).toEqual([['non-breaking', 'ac-payload-removed', 'c', 'message', '']]);
    expect(rows(compareContracts(channel([payload('message', 'subscribe', {}, false)]), channel([payload('message', 'subscribe', {})])).findings)).toEqual([
      ['breaking', 'ac-payload-became-required', 'c', 'message', ''],
    ]);
  });

  it('pairs a renamed operation with the one at its route, not the first one left', () => {
    const result = compareContracts(contract([op('x', [], '#/paths/~1a/get')]), contract([op('y', [], '#/paths/~1b/get'), op('z', [], '#/paths/~1a/get')]));
    expect(rows(result.findings)).toEqual([['non-breaking', 'endpoint-added', 'y', '', '']]);
  });

  it('an operation whose id changed and whose source is no route is removed and added', () => {
    const result = compareContracts(contract([op('a', [])]), contract([op('b', [])]));
    expect(rows(result.findings)).toEqual([
      ['breaking', 'api-removed-without-deprecation', 'a', '', ''],
      ['non-breaking', 'endpoint-added', 'b', '', ''],
    ]);
  });
});

describe('routeOf', () => {
  it.each([
    ['#/paths/~1pets~1{id}/get', 'get /pets/{}'],
    ['/paths/~1a~1{x}~1b~1{y}/post', 'post /a/{}/b/{}'],
    ['#/webhooks/new/post', undefined],
    ['#/paths/~1a/get/extra', undefined],
    ['x#/paths/~1a/get', undefined],
    ['#/paths/~1a~0b/get', 'get /a~b'],
  ])('%s is %s', (source, route) => {
    expect(routeOf(source)).toBe(route);
  });
});
