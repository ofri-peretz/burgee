/* eslint-disable maintainability/consistent-function-scoping -- a test's helpers sit beside the case they serve */
import { describe, expect, it } from 'vitest';

import { type Contract, type Direction, type Operation } from './core/model.js';
import { compareContracts, type Finding } from './diff-contract.js';
import {
  checkDecisions,
  type Decision,
  decisionsOf,
  distance,
  isDate,
  isReplacement,
  isText,
  keyOf,
  lookup,
  majorOf,
  meant,
  prefixes,
  readDecisions,
  replacementKey,
  segmentOf,
  withDecisions,
  wordsFor,
} from './diff-decisions.js';
import { read } from './openapi.js';

const R = 'response:200:application/json';

interface Extra {
  readonly path?: string;
  readonly id?: string;
  readonly version?: unknown;
  readonly op?: Record<string, unknown>;
  readonly parameters?: unknown[];
  readonly shared?: unknown[];
  readonly components?: Record<string, unknown>;
  readonly info?: Record<string, unknown>;
}

/** A one-operation OpenAPI contract around `schema`, so a test states only what it is about. */
const api = (schema: unknown, extra: Extra = {}): Contract =>
  read({
    openapi: '3.1.0',
    ...(extra.version === undefined && extra.info === undefined ? {} : { info: { title: 't', ...(extra.version === undefined ? {} : { version: extra.version }), ...extra.info } }),
    paths: {
      [extra.path ?? '/a']: {
        ...(extra.shared === undefined ? {} : { parameters: extra.shared }),
        get: {
          operationId: extra.id ?? 'a',
          ...extra.op,
          ...(extra.parameters === undefined ? {} : { parameters: extra.parameters }),
          responses: { 200: { content: { 'application/json': { schema } } } },
        },
      },
    },
    ...(extra.components === undefined ? {} : { components: extra.components }),
  });

const NOW = '2027-01-01';

const check = (old: Contract, nu: Contract, options: { today?: string; changeset?: boolean; side?: 'caller' | 'server' } = {}): Finding[] =>
  checkDecisions(old, nu, compareContracts(old, nu, { side: options.side }), { today: options.today ?? NOW, level: 'warn', changeset: options.changeset });

const ids = (findings: readonly Finding[]) => findings.map((finding) => [finding.id, finding.operation, finding.payload ?? '', finding.pointer]);

const keys = (contract: Contract) => [...decisionsOf(contract).keys()].map((key) => key.replaceAll('\n', '|')).sort();

const decision = (fields: Partial<Decision>): Decision => ({ operation: 'a', payload: R, pointer: '', ...fields });

/** A contract with no document behind it: an adapter's `source` that points nowhere. */
const bare = (operations: Operation[], document: unknown = {}): Contract => ({ format: 'x', document, operations });
const operation = (id: string, source: string, payloads: { name: string; direction?: Direction }[] = []): Operation => ({
  id,
  source,
  payloads: payloads.map((payload) => ({ name: payload.name, direction: payload.direction ?? 'request', schema: true, required: true })),
});

describe('lookup follows a local reference, and finds nothing otherwise', () => {
  const document = { a: { 'b/c': [{ 'd~e': 7 }] }, 'x y': { z: 1 }, '': { k: 2 } };

  it('reaches the document, a member, an array element, and a name with ~ and / escaped', () => {
    expect(lookup(document, '#')).toBe(document);
    expect(lookup(document, '#/a')).toBe(document.a);
    expect(lookup(document, '#/a/b~1c/0/d~0e')).toBe(7);
    expect(lookup(document, '#//k')).toBe(2);
  });

  it('decodes a percent escape in the fragment', () => {
    expect(lookup(document, '#/x%20y/z')).toBe(1);
  });

  it('finds nothing for a reference outside the document, a fragment that is not a pointer, a bad escape or a missing member', () => {
    expect(lookup(document, 'other.yaml#/a')).toBeUndefined();
    expect(lookup(document, 'a/b')).toBeUndefined();
    expect(lookup(document, '#a')).toBeUndefined();
    expect(lookup(document, '#/x%2')).toBeUndefined();
    expect(lookup(document, '#/x%zz')).toBeUndefined();
    expect(lookup(document, '#/missing')).toBeUndefined();
    expect(lookup(document, '#/a/b~1c/9')).toBeUndefined();
    expect(lookup(document, '#/toString')).toBeUndefined();
    expect(lookup(document, '#/a/b~1c/0/d~0e/deeper')).toBeUndefined();
  });
});

describe('the small readers', () => {
  it('words skip what is absent or empty', () => {
    expect(wordsFor('op', undefined, '', '/p', 'q')).toBe('op /p q');
    expect(wordsFor()).toBe('');
  });

  it('a decision text is a string with something in it', () => {
    expect([isText('ADR-1'), isText(' x '), isText(''), isText('  '), isText(5), isText(undefined)]).toEqual([true, true, false, false, false, false]);
  });

  it('a replacement is a non-empty name without a slash, or a JSON Pointer', () => {
    const accepted = ['amountCents', '/properties/amountCents', '/a~0b', '/a~1b', '/', '//'];
    const refused = ['', 'a/b', '/a~2', '/a~', '/a~b', 5, undefined, 'properties/a'];
    expect(accepted.map((value) => isReplacement(value))).toEqual(accepted.map(() => true));
    expect(refused.map((value) => isReplacement(value))).toEqual(refused.map(() => false));
  });

  it('a date is a string naming a day that exists', () => {
    expect(isDate(['2027-03-01'])).toBe(false);
    expect(isDate('2027-03-01')).toBe(true);
    expect(isDate('2027-04-31')).toBe(false);
    expect(isDate('2027-00-10')).toBe(false);
    expect(isDate(' 2027-03-01')).toBe(false);
    expect(isDate('2027-03-01 ')).toBe(false);
  });

  it('distance counts edits', () => {
    expect(distance('', '')).toBe(0);
    expect(distance('abc', '')).toBe(3);
    expect(distance('', 'abc')).toBe(3);
    expect(distance('abc', 'abc')).toBe(0);
    expect(distance('ab', 'ba')).toBe(2);
    expect(distance('kitten', 'sitting')).toBe(3);
    expect(distance('flaw', 'lawn')).toBe(2);
    expect(distance('x-change', 'x-chnage')).toBe(2);
    expect(distance('a', 'b')).toBe(1);
    expect(distance('ab', 'a')).toBe(1);
    expect(distance('a', 'ab')).toBe(1);
  });

  it('a near-miss is the marker within two edits, and a marker or a key that is not an x- key is none', () => {
    expect(meant('x-chnage')).toBe('x-change');
    expect(meant('x-sunst')).toBe('x-sunset');
    expect(meant('x-replaced-bi')).toBe('x-replaced-by');
    expect(meant('x-chang')).toBe('x-change');
    expect(meant('x-changes')).toBe('x-change');
    expect(meant('x-change')).toBeUndefined();
    expect(meant('x-sunset')).toBeUndefined();
    expect(meant('x-replaced-by')).toBeUndefined();
    expect(meant('x-chnaged')).toBeUndefined();
    expect(meant('x-vendor')).toBeUndefined();
    expect(meant('change')).toBeUndefined();
    expect(meant('sunset')).toBeUndefined();
    expect(meant('xx-change')).toBeUndefined();
    expect(meant('y-change')).toBeUndefined();
  });

  it('prefixes run from the pointer to the root', () => {
    expect(prefixes('')).toEqual(['']);
    expect(prefixes('/a')).toEqual(['/a', '']);
    expect(prefixes('/a/b/c')).toEqual(['/a/b/c', '/a/b', '/a', '']);
  });

  it('a major is the leading number of a version, with or without a v', () => {
    expect([majorOf('4.0.0'), majorOf('v4'), majorOf(4), majorOf('10.1'), majorOf('4')]).toEqual(['4', '4', '4', '10', '4']);
    expect([majorOf('x4'), majorOf(' 4'), majorOf(undefined), majorOf(''), majorOf('vv4'), majorOf({})]).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('a path segment is a /vN/ of an OpenAPI path or webhook', () => {
    const at = (source: string) => segmentOf(operation('o', source));
    expect(at('#/paths/~1v3~1wallet/get')).toBe('3');
    expect(at('#/webhooks/~1v3~1hook/post')).toBe('3');
    expect(at('#/paths/~1api~1v10~1x/get')).toBe('10');
    expect(at('#/paths/~1v3/get')).toBe('3');
    expect(at('#/paths/~1v3x/get')).toBeUndefined();
    expect(at('#/paths/~1video~1x/get')).toBeUndefined();
    expect(at('#/paths/~1x/get')).toBeUndefined();
    expect(at('#/other/~1v3/get')).toBeUndefined();
    expect(at('#/paths/~1x~1y/v3~1get')).toBeUndefined();
    expect(at('paths/~1v3/get')).toBeUndefined();
    expect(at('#/xpaths/~1v3/get')).toBeUndefined();
    expect(at('#')).toBeUndefined();
  });
});

describe('where decisions are read, member by member', () => {
  it('names a property by its escaped key', () => {
    const schema = { properties: { 'a/b': { 'x-change': '1' }, 'c~d': { 'x-change': '2' } } };
    expect(keys(api(schema))).toEqual([`a|${R}|/properties/a~1b`, `a|${R}|/properties/c~0d`]);
  });

  it('reaches additionalProperties, items, prefixItems and each composition, by index', () => {
    const marked = (n: number) => ({ 'x-change': String(n) });
    const schema = {
      additionalProperties: marked(1),
      items: marked(2),
      prefixItems: [{}, marked(3)],
      oneOf: [{}, marked(4)],
      anyOf: [marked(5)],
      allOf: [{}, {}, marked(6)],
    };
    expect(keys(api(schema))).toEqual(
      [`a|${R}|/additionalProperties`, `a|${R}|/items`, `a|${R}|/prefixItems/1`, `a|${R}|/oneOf/1`, `a|${R}|/anyOf/0`, `a|${R}|/allOf/2`, `a|${R}|`].sort(),
    );
  });

  it('reads an allOf branch as merged into its parent too, once, and a boolean schema as nothing', () => {
    const decisions = decisionsOf(api({ additionalProperties: false, allOf: [{ 'x-sunset': '2027-03-01' }] }));
    expect([...decisions.values()].map((entry) => [entry.pointer, entry.sunset])).toEqual([
      ['/allOf/0', '2027-03-01'],
      ['', '2027-03-01'],
    ]);
  });

  it('puts the referrer first when a member and the schema it points at both say something', () => {
    const contract = api({ $ref: '#/components/schemas/S', 'x-change': 'near' }, { components: { schemas: { S: { 'x-change': 'far', 'x-sunset': '2027-03-01' } } } });
    expect(decisionsOf(contract).get(keyOf('a', R, ''))).toStrictEqual({ change: 'near', sunset: '2027-03-01', operation: 'a', payload: R, pointer: '' });
  });

  it('does not follow a reference outside the document, or one that is not a string, or loop on one that cycles', () => {
    const outside = api({ properties: { x: { $ref: 'other.yaml#/S', 'x-change': '1' }, y: { $ref: 5, 'x-change': '2' } } });
    expect(keys(outside)).toEqual([`a|${R}|/properties/x`, `a|${R}|/properties/y`]);
    const cycle = api({ $ref: '#/components/schemas/N' }, { components: { schemas: { N: { 'x-change': '1', properties: { next: { $ref: '#/components/schemas/N' } } } } } });
    expect(keys(cycle)).toEqual([`a|${R}|`]);
    expect(readDecisions(cycle).members.has(keyOf('a', R, '/properties/next'))).toBe(true);
    const dangling = api({ properties: { x: { $ref: '#/nowhere', 'x-change': '1' } } });
    expect(keys(dangling)).toEqual([`a|${R}|/properties/x`]);
  });

  it('reads a parameter by its in and name, from the operation or the path, through a reference, and skips what is not one', () => {
    const contract = api(
      {},
      {
        shared: [{ name: 'p', in: 'path', 'x-change': 'path-level' }],
        parameters: [
          { name: 'q', in: 'query', 'x-change': 'direct' },
          { $ref: '#/components/parameters/L' },
          { $ref: '#/components/parameters/A' },
          'not a parameter',
          { $ref: '#/components/parameters/Loop' },
        ],
        components: {
          parameters: {
            L: { name: 'l', in: 'header', 'x-change': 'by-ref' },
            A: { $ref: '#/components/parameters/L2' },
            L2: { name: 'm', in: 'cookie', 'x-change': 'two-hops' },
            Loop: { $ref: '#/components/parameters/Loop' },
          },
        },
      },
    );
    expect(keys(contract)).toEqual(['a|param:cookie:m|', 'a|param:header:l|', 'a|param:path:p|', 'a|param:query:q|']);
    expect(decisionsOf(contract).get(keyOf('a', 'param:path:p', ''))?.change).toBe('path-level');
  });

  it('reads a marker on a parameter and on its schema as one decision, the parameter first', () => {
    const contract = api({}, { parameters: [{ name: 'q', in: 'query', 'x-change': 'on-parameter', schema: { 'x-change': 'on-schema', 'x-sunset': '2027-03-01' } }] });
    expect(decisionsOf(contract).get(keyOf('a', 'param:query:q', ''))).toStrictEqual({
      change: 'on-parameter',
      sunset: '2027-03-01',
      operation: 'a',
      payload: 'param:query:q',
      pointer: '',
    });
  });

  it('knows a payload root that has no schema to walk', () => {
    const contract = api({}, { parameters: [{ name: 'q', in: 'query' }] });
    expect(readDecisions(contract).members.has(keyOf('a', 'param:query:q', ''))).toBe(true);
  });

  it('survives a null in the schema and an operation whose source is nowhere', () => {
    expect(keys(api({ example: null, enum: [null], properties: { x: { default: null, 'x-change': '1' } } }))).toEqual([`a|${R}|/properties/x`]);
    const lost = bare([operation('o', '#/x/o', [{ name: 'p' }])]);
    const { decisions, members, problems } = readDecisions(lost);
    expect([decisions.size, problems.length]).toEqual([0, 0]);
    expect([...members].sort()).toEqual([keyOf('o', '', ''), keyOf('o', 'p', '')].sort());
  });

  it('reads a marker on a JSON Schema document that is its own operation, without a parameters list to look in', () => {
    const contract = bare([operation('e', '#', [{ name: 'value' }])], { 'x-change': 'root' });
    expect(keys(contract)).toEqual(['e||']);
  });
});

describe('what is wrong with a marker, said exactly', () => {
  const finding = (rest: Partial<Finding> & Pick<Finding, 'id' | 'operation' | 'source' | 'fix' | 'before' | 'after'>): Finding => ({
    scheme: 'apicontract',
    verdict: 'unknown',
    effect: 'neutral',
    document: 'new',
    direction: 'request',
    pointer: '',
    ...rest,
  });

  it('on an operation: no payload, direction request', () => {
    const contract = api({}, { op: { 'x-change': '' } });
    expect(readDecisions(contract).problems).toStrictEqual([
      finding({
        id: 'ac-decision-invalid',
        operation: 'a',
        source: '#/paths/~1a/get',
        before: '',
        after: undefined,
        fix: 'a has a bad `x-change`. fix: write `x-change: <the decision>`: an ADR id, a ticket or a URL, as non-empty text',
      }),
    ]);
  });

  it('in a response: the payload, its direction, and the member', () => {
    const contract = api({ properties: { x: { 'x-sunset': 'soon' } } });
    expect(readDecisions(contract, 'error').problems).toStrictEqual([
      finding({
        id: 'ac-decision-invalid',
        verdict: 'breaking',
        operation: 'a',
        source: '#/paths/~1a/get',
        payload: R,
        direction: 'response',
        pointer: '/properties/x',
        before: 'soon',
        after: undefined,
        fix: `a ${R} /properties/x has a bad \`x-sunset\`. fix: write \`x-sunset: 2027-03-01\`: a real date as YYYY-MM-DD`,
      }),
    ]);
  });

  it('is said once when an allOf branch is read twice', () => {
    const contract = api({ allOf: [{ properties: { x: { 'x-sunset': 'soon' } } }] });
    expect(readDecisions(contract).problems.map((entry) => entry.pointer)).toEqual(['/allOf/0/properties/x', '/properties/x']);
  });

  it('is said for two bad markers on one member, and for one marker bad in two members', () => {
    const contract = api({ properties: { x: { 'x-sunset': 'soon', 'x-change': ' ' }, y: { 'x-sunset': 'soon' } } });
    expect(readDecisions(contract).problems.map((entry) => [entry.pointer, entry.before])).toEqual([
      ['/properties/x', ' '],
      ['/properties/x', 'soon'],
      ['/properties/y', 'soon'],
    ]);
  });

  it('outside any operation: the document, and the offending object', () => {
    const contract = api({}, { info: { 'x-change': 'ADR-1' } });
    expect(readDecisions(contract).problems).toStrictEqual([
      finding({
        id: 'ac-decision-misplaced',
        operation: '(document)',
        source: '#/info',
        before: 'x-change',
        after: 'ADR-1',
        fix: '`x-change` at #/info is not on a schema member, an operation or a parameter. fix: move it onto the member it describes, or remove it',
      }),
    ]);
  });

  it('inside an operation but off a position: the operation it is in', () => {
    const contract = api({}, { op: { 'x-replaced-by': 'b' } });
    const nested = read({
      openapi: '3.1.0',
      paths: { '/a': { get: { operationId: 'a', responses: { 200: { 'x-sunset': '2027-03-01', content: {} } } } } },
    });
    expect(readDecisions(contract).problems).toEqual([]);
    expect(readDecisions(nested).problems.map((entry) => [entry.id, entry.operation, entry.source, entry.before])).toEqual([
      ['ac-decision-misplaced', 'a', '#/paths/~1a/get/responses/200', 'x-sunset'],
    ]);
  });

  it('names x-replaced-by as a marker that can be misplaced and misspelled', () => {
    const contract = api({}, { info: { 'x-replaced-by': 'b', 'x-replaced-bi': 'b' }, op: { 'x-chnage': '1' } });
    expect(readDecisions(contract).problems.map((entry) => [entry.id, entry.operation, entry.source, entry.before, entry.after])).toEqual([
      ['ac-decision-misplaced', '(document)', '#/info', 'x-replaced-by', 'b'],
      ['ac-decision-misspelled', '(document)', '#/info', 'x-replaced-bi', 'x-replaced-by'],
      ['ac-decision-misspelled', 'a', '#/paths/~1a/get', 'x-chnage', 'x-change'],
    ]);
  });

  it('attributes an object to an operation only at its source or below it', () => {
    const contract = bare([operation('o', '#/x/o')], { x: { o: { 'x-chnage': 1 }, o2: { 'x-chnage': 2 }, o3: { deeper: { 'x-chnage': 3 } } }, 'x-chnage': 4 });
    expect(readDecisions(contract).problems.map((entry) => [entry.operation, entry.source, entry.direction, entry.document, entry.pointer])).toEqual([
      ['(document)', '#', 'request', 'new', ''],
      ['o', '#/x/o', 'request', 'new', ''],
      ['(document)', '#/x/o2', 'request', 'new', ''],
      ['(document)', '#/x/o3/deeper', 'request', 'new', ''],
    ]);
    expect(readDecisions(bare([operation('o', '#/x/o')], { x: { o: { deeper: { 'x-chnage': 1 } } } })).problems[0]?.operation).toBe('o');
  });

  it('does not read an example, a default, an enum or a const as contract', () => {
    const contract = api(
      { properties: { x: { example: { 'x-chnage': 1 }, examples: [{ 'x-chnage': 1 }], default: { 'x-chnage': 1 }, enum: [{ 'x-chnage': 1 }], const: { 'x-chnage': 1 } } } },
      { info: { example: { 'x-change': 1 } } },
    );
    expect(readDecisions(contract).problems).toEqual([]);
    expect(readDecisions(api({}, { info: { notes: { 'x-change': 1 } } })).problems.map((entry) => entry.source)).toEqual(['#/info/notes']);
  });

  it('grades a problem a warning unless told otherwise', () => {
    expect(readDecisions(api({}, { info: { 'x-change': 1 } })).problems[0]?.verdict).toBe('unknown');
    expect(readDecisions(api({}, { info: { 'x-change': 1 } }), 'warn').problems[0]?.verdict).toBe('unknown');
    expect(readDecisions(api({}, { info: { 'x-change': 1 } }), 'error').problems[0]?.verdict).toBe('breaking');
  });

  it('reads a marker on a $ref target as permitted, and one nobody reaches as misplaced', () => {
    const components = { schemas: { Used: { 'x-change': '1' }, Unused: { 'x-change': '2' } } };
    const contract = api({ $ref: '#/components/schemas/Used' }, { components });
    expect(readDecisions(contract).problems.map((entry) => entry.source)).toEqual(['#/components/schemas/Unused']);
  });
});

describe('what a breaking change is held to, at the edges (R5, R8)', () => {
  const old = api({ properties: { k: { enum: ['a'] } } });
  const wider = (marker: Record<string, unknown>) => api({ properties: { k: { enum: ['a', 'b'], ...marker } } });

  it('a new operation is breaking to a server, and held to a decision like any change', () => {
    const empty = read({ openapi: '3.1.0', paths: {} });
    const added = api({}, { op: { 'x-change': 'ADR-1' } });
    const bareAdded = api({});
    expect(ids(check(empty, bareAdded, { side: 'server' }))).toEqual([['ac-decision-missing', 'a', '', '']]);
    expect(ids(check(empty, added, { side: 'server', changeset: true }))).toEqual([]);
    expect(ids(check(empty, added, { side: 'server' }))).toEqual([['ac-decision-unversioned', 'a', '', '']]);
  });

  it('a removed operation on schedule, written on the operation, needs no marker', () => {
    const gone = read({ openapi: '3.1.0', paths: {} });
    const dated = (marker: Record<string, unknown>) => api({}, { op: marker });
    expect(check(dated({ deprecated: true, 'x-sunset': '2026-06-01' }), gone)).toEqual([]);
    expect(ids(check(dated({ 'x-sunset': '2026-06-01' }), gone))).toEqual([['ac-decision-missing', 'a', '', '']]);
    expect(ids(check(dated({ deprecated: true }), gone))).toEqual([['ac-decision-missing', 'a', '', '']]);
    expect(ids(check(dated({ deprecated: true, 'x-sunset': '2027-06-01' }), gone))).toEqual([['ac-decision-missing', 'a', '', '']]);
    expect(ids(check(dated({ deprecated: false, 'x-sunset': '2026-06-01' }), gone))).toEqual([['ac-decision-missing', 'a', '', '']]);
  });

  it('a payload-level sunset does not excuse the removal of the whole operation', () => {
    const gone = read({ openapi: '3.1.0', paths: {} });
    const param = api({}, { parameters: [{ name: 'q', in: 'query', deprecated: true, 'x-sunset': '2026-06-01' }] });
    expect(ids(check(param, gone))).toEqual([['ac-decision-missing', 'a', '', '']]);
  });

  it('a sunset on the old side excuses a change inside it, not beside it', () => {
    const dated = api({ properties: { k: { enum: ['a'], deprecated: true, 'x-sunset': '2026-06-01' }, j: { enum: ['a'] } } });
    const both = api({ properties: { k: { enum: ['a', 'b'] }, j: { enum: ['a', 'b'] } } });
    expect(ids(check(dated, both))).toEqual([['ac-decision-missing', 'a', R, '/properties/j']]);
  });

  it('a marker with only a sunset, or only a replacement, is not a decision for the change', () => {
    expect(ids(check(old, wider({ deprecated: true, 'x-sunset': '2030-01-01' })))).toEqual([['ac-decision-missing', 'a', R, '/properties/k']]);
    expect(ids(check(old, wider({ 'x-replaced-by': 'j' })))).toEqual([
      ['ac-decision-missing', 'a', R, '/properties/k'],
      ['ac-decision-replacement-missing', 'a', R, '/properties/k'],
    ]);
  });

  it('an operation paired by route carries its old decisions over to its new id', () => {
    const before = api({ properties: { p: { type: 'string', deprecated: true, 'x-sunset': '2026-06-01' } }, required: ['p'] }, { id: 'old' });
    const after = api({ properties: {} }, { id: 'new' });
    expect(compareContracts(before, after).findings.map((entry) => [entry.verdict, entry.operation])).toEqual([['breaking', 'new']]);
    expect(check(before, after)).toEqual([]);
  });

  it('is graded error when asked, for each kind of finding', () => {
    const contract = api({}, { info: { 'x-change': 1 } });
    const findings = checkDecisions(old, contract, compareContracts(old, contract), { today: NOW, level: 'error' });
    expect(findings.every((entry) => entry.verdict === 'breaking')).toBe(true);
  });
});

describe('a marker must match a change, at the edges (R6)', () => {
  const base = { properties: { a: { type: 'string' }, ab: { type: 'string', maxLength: 5 }, o: { properties: { x: { type: 'string', maxLength: 5 } } } } };
  const withMarker = (where: 'a' | 'ab' | 'o', change: { ab?: number; x?: number }, marker: Record<string, unknown>) => {
    const next = structuredClone(base) as typeof base;
    if (change.ab !== undefined) next.properties.ab.maxLength = change.ab;
    if (change.x !== undefined) next.properties.o.properties.x.maxLength = change.x;
    Object.assign(next.properties[where], marker);
    return api(next);
  };
  const old = api(base);

  it('a marker on a sibling whose name is a prefix of the changed member is stale', () => {
    expect(ids(check(old, withMarker('a', { ab: 3 }, { 'x-change': 'ADR-1' })))).toEqual([['ac-decision-stale', 'a', R, '/properties/a']]);
  });

  it('a marker on the changed member, or on an ancestor of what changed, is not stale', () => {
    expect(check(old, withMarker('ab', { ab: 3 }, { 'x-change': 'ADR-1' }))).toEqual([]);
    expect(check(old, withMarker('o', { x: 3 }, { 'x-change': 'ADR-1' }))).toEqual([]);
  });

  it('a marker on the operation is matched by a change in any payload; one on another payload is not', () => {
    const [a, b] = [{ 'x-change': 'ADR-1' }, { 'x-change': 'ADR-2' }];
    const changed = structuredClone(base) as typeof base;
    changed.properties.ab.maxLength = 3;
    expect(check(old, api(changed, { op: a }))).toEqual([]);
    const before = api(base, { parameters: [{ name: 'q', in: 'query' }] });
    const withParameter = api(changed, { parameters: [{ name: 'q', in: 'query', ...b }] });
    expect(ids(check(before, withParameter))).toEqual([['ac-decision-stale', 'a', 'param:query:q', '']]);
  });

  it('a marker in another operation is not matched by a change in this one', () => {
    const two = (changeB: boolean, marked: boolean) =>
      read({
        openapi: '3.1.0',
        paths: {
          '/a': { get: { operationId: 'a', responses: { 200: { content: { 'application/json': { schema: { properties: { k: { maxLength: changeB ? 3 : 4 } } } } } } } } },
          '/b': { get: { operationId: 'b', ...(marked ? { 'x-change': 'ADR-1' } : {}), responses: { 200: { content: { 'application/json': { schema: { type: 'string' } } } } } } },
        },
      });
    expect(ids(check(two(false, false), two(true, true)))).toEqual([['ac-decision-stale', 'b', '', '']]);
  });

  it('a marker with no change of its own, only a sunset or a replacement, is never stale', () => {
    expect(check(old, api({ ...base, 'x-sunset': '2030-01-01', deprecated: true }))).toEqual([]);
  });

  it('a marker carried over under a renamed operation is history', () => {
    const before = api({ 'x-change': 'ADR-1' }, { id: 'old' });
    const after = api({ 'x-change': 'ADR-1' }, { id: 'new' });
    expect(check(before, after)).toEqual([]);
  });
});

describe('where a decision finding points (R13)', () => {
  const place = (extra: Partial<Finding>) => ({ scheme: 'apicontract', verdict: 'unknown', effect: 'neutral', document: 'new', ...extra });

  it('on a response payload: the direction it travels, the member, and the operation among several', () => {
    const contract = read({
      openapi: '3.1.0',
      paths: {
        '/a': { get: { operationId: 'a', responses: { 200: { content: { 'application/json': { schema: {} } } } } } },
        '/b': {
          get: {
            operationId: 'b',
            parameters: [{ name: 'q', in: 'query', 'x-sunset': '2026-06-01' }],
            responses: { 404: { content: { 'application/json': { schema: { properties: { k: { 'x-sunset': '2026-06-01' } } } } } }, 200: { content: {} } },
          },
        },
      },
    });
    const findings = check(contract, contract);
    expect(findings).toStrictEqual([
      {
        ...place({}),
        id: 'ac-decision-overdue',
        operation: 'b',
        source: '#/paths/~1b/get',
        payload: 'param:query:q',
        direction: 'request',
        pointer: '',
        before: '2026-06-01',
        after: NOW,
        fix: 'b param:query:q was to go after 2026-06-01 and is still here. fix: remove it as decided, or move `x-sunset` to a date that still holds',
      },
      {
        ...place({}),
        id: 'ac-decision-overdue',
        operation: 'b',
        source: '#/paths/~1b/get',
        payload: 'response:404:application/json',
        direction: 'response',
        pointer: '/properties/k',
        before: '2026-06-01',
        after: NOW,
        fix: 'b response:404:application/json /properties/k was to go after 2026-06-01 and is still here. fix: remove it as decided, or move `x-sunset` to a date that still holds',
      },
    ]);
  });

  it('on an operation: no payload', () => {
    const contract = api({}, { op: { 'x-sunset': '2026-06-01' } });
    expect(check(contract, contract)).toStrictEqual([
      {
        ...place({}),
        id: 'ac-decision-overdue',
        operation: 'a',
        source: '#/paths/~1a/get',
        direction: 'request',
        pointer: '',
        before: '2026-06-01',
        after: NOW,
        fix: 'a was to go after 2026-06-01 and is still here. fix: remove it as decided, or move `x-sunset` to a date that still holds',
      },
    ]);
  });
});

describe('where a replacement is looked for (R9)', () => {
  it('an operation by id', () => {
    expect(replacementKey(decision({ payload: '', replacedBy: 'b' }))).toBe(keyOf('b', '', ''));
  });

  it('a parameter by a sibling name of the same kind, and any other payload by its own name', () => {
    expect(replacementKey(decision({ payload: 'param:query:old', replacedBy: 'fresh' }))).toBe(keyOf('a', 'param:query:fresh', ''));
    expect(replacementKey(decision({ payload: 'body:application/json', replacedBy: 'body:text/plain' }))).toBe(keyOf('a', 'body:text/plain', ''));
  });

  it('a property by a sibling name or by a pointer from its parent', () => {
    expect(replacementKey(decision({ pointer: '/properties/x', replacedBy: 'y' }))).toBe(keyOf('a', R, '/properties/y'));
    expect(replacementKey(decision({ pointer: '/properties/x', replacedBy: '/properties/z' }))).toBe(keyOf('a', R, '/properties/z'));
    expect(replacementKey(decision({ pointer: '/properties/a/properties/b', replacedBy: 'c' }))).toBe(keyOf('a', R, '/properties/a/properties/c'));
    expect(replacementKey(decision({ pointer: '/properties/properties', replacedBy: 'k' }))).toBe(keyOf('a', R, '/properties/k'));
    expect(replacementKey(decision({ pointer: '/properties/x', replacedBy: 'a~b' }))).toBe(keyOf('a', R, '/properties/a~0b'));
  });

  it('a member that is not a property by a pointer from the member that holds it', () => {
    expect(replacementKey(decision({ pointer: '/items', replacedBy: '/properties/q' }))).toBe(keyOf('a', R, '/properties/q'));
    expect(replacementKey(decision({ pointer: '/properties/a/items', replacedBy: '/x' }))).toBe(keyOf('a', R, '/properties/a/x'));
  });

  it('finds a parameter and a nested property in a contract', () => {
    const contract = (present: boolean) =>
      api(
        { properties: { o: { properties: { old: { 'x-replaced-by': 'new' }, ...(present ? { new: {} } : {}) } } } },
        { parameters: [{ name: 'old', in: 'query', 'x-replaced-by': 'new' }, ...(present ? [{ name: 'new', in: 'query' }] : [])] },
      );
    expect(check(contract(true), contract(true))).toEqual([]);
    expect(ids(check(contract(true), contract(false)))).toEqual([
      ['ac-decision-replacement-missing', 'a', 'param:query:old', ''],
      ['ac-decision-replacement-missing', 'a', R, '/properties/o/properties/old'],
    ]);
  });
});

describe('a decided breaking change moves the version, at the edges (R10)', () => {
  const old = (path: string, version: unknown) => api({ properties: { k: { enum: ['a'] } } }, { path, version });
  const decided = (path: string, version: unknown) => api({ properties: { k: { enum: ['a', 'b'], 'x-change': 'ADR-1' } } }, { path, version });
  const moved = (from: [string, unknown], to: [string, unknown]): boolean => !check(old(...from), decided(...to)).some((entry) => entry.id === 'ac-decision-unversioned');

  it('a new major segment in the path', () => {
    expect([
      moved(['/v3/x', '1'], ['/v4/x', '1']),
      moved(['/v3/x', '1'], ['/v3/x', '1']),
      moved(['/x', '1'], ['/v4/x', '1']),
      moved(['/v4', '1'], ['/v5', '1']),
      moved(['/api/v10/x', '1'], ['/api/v11/x', '1']),
      moved(['/v3x/y', '1'], ['/v4x/y', '1']),
      moved(['/video/x', '1'], ['/video/y', '1']),
      moved(['/v3/x', '1'], ['/x', '1']),
    ]).toEqual([true, false, true, true, true, false, false, false]);
  });

  it('a new major in info.version', () => {
    expect([
      moved(['/x', '3.0.0'], ['/x', '4.0.0']),
      moved(['/x', '3.0.0'], ['/x', '3.9.0']),
      moved(['/x', 3], ['/x', 4]),
      moved(['/x', 'v3'], ['/x', 'v4']),
      moved(['/x', undefined], ['/x', '4.0.0']),
      moved(['/x', '3.0.0'], ['/x', undefined]),
      moved(['/x', 'x'], ['/x', '4']),
      moved(['/x', '3'], ['/x', 'y']),
    ]).toEqual([true, false, true, true, false, false, false, false]);
  });

  it('says the versions it compared, and has none to say for a document without info', () => {
    const finding = check(old('/x', '3.0.0'), decided('/x', '3.1.0'))[0];
    expect([finding?.before, finding?.after]).toEqual(['3.0.0', '3.1.0']);
    const none = check(old('/x', undefined), decided('/x', undefined))[0];
    expect([none?.before, none?.after]).toEqual([undefined, undefined]);
    const noVersion = check(api({ properties: { k: { enum: ['a'] } } }, { info: {} }), api({ properties: { k: { enum: ['a', 'b'], 'x-change': 'ADR-1' } } }, { info: {} }))[0];
    expect([noVersion?.before, noVersion?.after]).toEqual([undefined, undefined]);
  });

  it('is asked of a decided breaking change in a payload nothing else decides', () => {
    expect(ids(check(old('/x', '1'), decided('/x', '1')))).toEqual([['ac-decision-unversioned', 'a', R, '/properties/k']]);
  });
});

describe('withDecisions', () => {
  const comparison = compareContracts(api({}), api({}));
  const finding = { id: 'ac-decision-stale' } as Finding;

  it('counts decisions in the verdict at error only, and only when there are some', () => {
    expect(withDecisions(comparison, [finding], 'error').verdict).toBe('breaking');
    expect(withDecisions(comparison, [finding], 'warn').verdict).toBe('non-breaking');
    expect(withDecisions(comparison, [], 'error').verdict).toBe('non-breaking');
    expect(withDecisions(comparison, [finding], 'warn').decisions).toEqual([finding]);
  });
});
