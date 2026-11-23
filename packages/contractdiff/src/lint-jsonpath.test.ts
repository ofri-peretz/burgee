/**
 * apicontract-lint R9: the JSONPath subset a carried Spectral `given` may use.
 */
import { describe, expect, it } from 'vitest';

import { parse, query } from './lint-jsonpath.js';

const document = {
  info: { title: 't', 'x/y~z': 1 },
  paths: {
    '/pets': { get: { operationId: 'list', deprecated: true, tags: ['pets'] }, post: { operationId: 'add', deprecated: false, size: 2 } },
    '/owners': { get: { operationId: 'owners', size: 2 }, parameters: [{ name: 'id' }] },
  },
};

const at = (path: string): string[] => query(document, parse(path)).map((match) => match.pointer);

describe('parse', () => {
  it('reads root, children, keys, key lists, wildcards, descent and filters', () => {
    expect(parse('$')).toEqual([]);
    expect(parse("$.paths['/pets'][get, \"post\"].*")).toEqual([
      { kind: 'keys', keys: ['paths'] },
      { kind: 'keys', keys: ['/pets'] },
      { kind: 'keys', keys: ['get', 'post'] },
      { kind: 'wildcard' },
    ]);
    expect(parse('$..description')).toEqual([{ kind: 'descend' }, { kind: 'keys', keys: ['description'] }]);
    expect(parse('$..*')).toEqual([{ kind: 'descend' }, { kind: 'wildcard' }]);
    expect(parse('$..[*]')).toEqual([{ kind: 'descend' }, { kind: 'wildcard' }]);
    expect(parse("$[?(@.a.b == 'x')][?(@.c )][?(@.n == -1.5)][?(@.t==true)][?(@.f == false)][?(@.d == \"qq\")][?(@.n == 12)][?(@.n == 1.25)]")).toEqual([
      { kind: 'filter', field: ['a', 'b'], equals: 'x' },
      { kind: 'filter', field: ['c'] },
      { kind: 'filter', field: ['n'], equals: -1.5 },
      { kind: 'filter', field: ['t'], equals: true },
      { kind: 'filter', field: ['f'], equals: false },
      { kind: 'filter', field: ['d'], equals: 'qq' },
      { kind: 'filter', field: ['n'], equals: 12 },
      { kind: 'filter', field: ['n'], equals: 1.25 },
    ]);
    expect(parse('$[ * ][ ?(@.a) ].x[get , post]')).toEqual([{ kind: 'wildcard' }, { kind: 'filter', field: ['a'] }, { kind: 'keys', keys: ['x'] }, { kind: 'keys', keys: ['get', 'post'] }]);
  });

  it.each([
    ['paths', 'paths: a path starts at the root, `$`'],
    ['$.paths[*', '$.paths[*: a `[` is never closed'],
    ['$.paths.*~', '$.paths.*~: `.*~` is outside the subset'],
    ['$.paths^', '$.paths^: `.paths^` is outside the subset'],
    ['$.info.@key', '$.info.@key: `.@key` is outside the subset'],
    ['$.a.', '$.a.: `.` is outside the subset'],
    ['$[?(@property == "get")]', '$[?(@property == "get")]: `[?(@property == "get")]` is outside the subset (keys, `*`, `?(@.x)` and `?(@.x == \'y\')`)'],
    ['$[?(@.a == b)]', '$[?(@.a == b)]: the filter compares with `b`, which is not a string, number or boolean'],
    ['$[?(@.a == 1 == 2)]', '$[?(@.a == 1 == 2)]: `[?(@.a == 1 == 2)]` is outside the subset'],
    ['$[?(@.a > 1)]', '$[?(@.a > 1)]: `[?(@.a > 1)]` is outside the subset'],
    ['$[?(@.a)', '$[?(@.a): a `[` is never closed'],
    ['$[a b]', '$[a b]: `[a b]` is outside the subset'],
    ['$[a, b c]', '$[a, b c]: `[a, b c]` is outside the subset'],
    ['$[]', '$[]: `[]` is outside the subset'],
    ['$abc', '$abc: `abc` is outside the subset'],
    ['$.[a]', '$.[a]: `.[a]` is outside the subset'],
    ['$[xxxxa)]', '$[xxxxa)]: `[xxxxa)]` is outside the subset'],
    ['$[?(@.ab]', '$[?(@.ab]: `[?(@.ab]` is outside the subset'],
    ['$[?(@.a.!)]', '$[?(@.a.!)]: `[?(@.a.!)]` is outside the subset'],
    ["$[?(@.a == x'a')]", "the filter compares with `x'a'`"],
    ["$[?(@.a == 'a'x)]", "the filter compares with `'a'x`"],
    ['$[?(@.a == x"a")]', 'the filter compares with `x"a"`'],
    ['$[?(@.a == "a"x)]', 'the filter compares with `"a"x`'],
    ['$[?(@.a == x1)]', 'the filter compares with `x1`'],
    ['$[?(@.a == 1x)]', 'the filter compares with `1x`'],
    ['$[?(@.a == 1.)]', 'the filter compares with `1.`'],
  ])('refuses %s', (path, message) => {
    expect(() => parse(path)).toThrow(message);
  });
});

describe('query', () => {
  it('finds each value at its JSON Pointer, escaped', () => {
    expect(at('$')).toEqual(['#']);
    expect(at("$.info['x/y~z']")).toEqual(['#/info/x~1y~0z']);
    expect(at('$.paths.*[get,post]')).toEqual(['#/paths/~1pets/get', '#/paths/~1pets/post', '#/paths/~1owners/get']);
    expect(at('$.paths.*.*.operationId')).toEqual(['#/paths/~1pets/get/operationId', '#/paths/~1pets/post/operationId', '#/paths/~1owners/get/operationId']);
    expect(query(document, parse('$.info.title'))).toEqual([{ pointer: '#/info/title', value: 't' }]);
  });

  it('finds nothing under a value that has no members, and a key that is not there', () => {
    expect(query({ a: null }, parse('$.a.*'))).toEqual([]);
    expect(query({ a: null }, parse('$.a.b'))).toEqual([]);
    expect(at('$.info.title.*')).toEqual([]);
    expect(at('$.info.title.length')).toEqual([]);
    expect(at('$.info.missing')).toEqual([]);
    expect(at('$.info.title[?(@.x)]')).toEqual([]);
  });

  it('descends to every depth, the node itself included, and reaches into arrays', () => {
    expect(at('$..operationId')).toEqual(['#/paths/~1pets/get/operationId', '#/paths/~1pets/post/operationId', '#/paths/~1owners/get/operationId']);
    expect(at('$..name')).toEqual(['#/paths/~1owners/parameters/0/name']);
    expect(at('$.info..*')).toEqual(['#/info/title', '#/info/x~1y~0z']);
    expect(at('$.info..title')).toEqual(['#/info/title']);
  });

  it('filters children by a member being set, or equal to a literal', () => {
    expect(at('$.paths.*[?(@.deprecated)]')).toEqual(['#/paths/~1pets/get']);
    expect(at('$.paths.*[?(@.operationId)]')).toEqual(['#/paths/~1pets/get', '#/paths/~1pets/post', '#/paths/~1owners/get']);
    expect(at('$.paths.*[?(@.deprecated == false)]')).toEqual(['#/paths/~1pets/post']);
    expect(at('$.paths.*[?(@.size == 2)]')).toEqual(['#/paths/~1pets/post', '#/paths/~1owners/get']);
    expect(at("$.paths.*[?(@.operationId == 'add')]")).toEqual(['#/paths/~1pets/post']);
    expect(at('$.paths.*[?(@.missing.deep)]')).toEqual([]);
    expect(query({ a: { x: null }, b: { x: 0 } }, parse('$[?(@.x)]')).map((match) => match.pointer)).toEqual(['#/b']);
  });

  it('gives each value once, however many ways the path reaches it', () => {
    expect(at('$..*..title')).toEqual(['#/info/title']);
    expect(at('$.info[title,title]')).toEqual(['#/info/title']);
  });
});
