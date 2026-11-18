import { describe, expect, it } from 'vitest';

import { JsonPathError, parse, query } from './input-overlay-jsonpath.js';

const document = {
  info: { title: 'Pets', 'x-a-b': 1 },
  servers: [
    { url: 'https://dev', description: 'Dev', weight: 1 },
    { url: 'https://prod', description: 'Prod', weight: 3 },
    { url: 'https://edge', weight: 2, tags: ['a'] },
  ],
  paths: {
    '/pets': { get: { responses: { 200: { description: 'ok' }, 500: { description: 'oops' } } } },
    '/pets/{id}': { get: { responses: { 404: { description: 'gone' } } }, 'x-flag': true },
  },
  'a b': { "it's": 'quoted', 'say "hi"': 2 },
  nothing: null,
};

const values = (path: string): unknown[] => query(document, path).map(({ value }) => value);
const keys = (path: string): unknown[] => query(document, path).map(({ key }) => key);

const refusal = (path: string): string => {
  try {
    parse(path);
  } catch (error) {
    expect(error).toBeInstanceOf(JsonPathError);
    return (error as Error).message;
  }
  throw new Error(`${path} parsed`);
};

describe('selectors', () => {
  it('selects the root, names, wildcards and indexes', () => {
    expect(query(document, '$')).toEqual([{ value: document, parent: undefined, key: undefined }]);
    expect(values('$.info.title')).toEqual(['Pets']);
    expect(values('$.info.x-a-b')).toEqual([1]);
    expect(values("$['a b'][\"it's\"]")).toEqual(['quoted']);
    expect(values("$['a b']['say \\\"hi\\\"']")).toEqual([2]);
    expect(values('$.info.*')).toEqual(['Pets', 1]);
    expect(values('$.servers[*].url')).toEqual(['https://dev', 'https://prod', 'https://edge']);
    expect(values('$.servers[1].url')).toEqual(['https://prod']);
    expect(values('$.servers[-1].url')).toEqual(['https://edge']);
    expect(values('$.servers[5]')).toEqual([]);
    expect(values("$.info['title', 'x-a-b' ]")).toEqual(['Pets', 1]);
    expect(values('$.servers[0, 2].weight')).toEqual([1, 2]);
    expect(values('$.nothing')).toEqual([null]);
    const list = { list: Array.from({ length: 12 }, (_, index) => index) };
    expect(query(list, '$.list[11]').map(({ value }) => value)).toEqual([11]);
    expect(query(list, '$.list[-12]').map(({ value }) => value)).toEqual([0]);
    expect(values('$.info[-1]')).toEqual([]);
  });

  it('selects nothing where the value has no such member or item', () => {
    expect(values('$.servers.url')).toEqual([]);
    expect(values('$.info[0]')).toEqual([]);
    expect(values('$.info.title.length')).toEqual([]);
    expect(values('$.info.title[0]')).toEqual([]);
    expect(values('$.missing.deeper')).toEqual([]);
    expect(values('$.info.title.*')).toEqual([]);
  });

  it('returns each node with the object or array that holds it', () => {
    const [server] = query(document, '$.servers[2]');
    expect(server).toEqual({ value: document.servers[2], parent: document.servers, key: 2 });
    expect(server?.parent).toBe(document.servers);
    const [title] = query(document, '$.info.title');
    expect(title?.parent).toBe(document.info);
    expect(title?.key).toBe('title');
  });

  it('descends to every level with `..`', () => {
    expect(values('$.paths..description')).toEqual(['ok', 'oops', 'gone']);
    expect(keys("$.paths..responses['500']")).toEqual(['500']);
    expect(values('$..tags[0]')).toEqual(['a']);
    // Three servers, nine members under them, and the one tag.
    expect(values('$.servers..*').length).toBe(13);
    expect(values('$..[?@.weight > 2].url')).toEqual(['https://prod']);
  });
});

describe('filters', () => {
  it('compares with each operator, over numbers and strings', () => {
    expect(values("$.servers[?@.description == 'Dev'].url")).toEqual(['https://dev']);
    expect(values("$.servers[?(@.description != 'Dev')].url")).toEqual(['https://prod', 'https://edge']);
    expect(values('$.servers[?@.weight < 2].url')).toEqual(['https://dev']);
    expect(values('$.servers[?@.weight <= 2].url')).toEqual(['https://dev', 'https://edge']);
    expect(values('$.servers[?@.weight > 2].url')).toEqual(['https://prod']);
    expect(values('$.servers[?@.weight >= 2].url')).toEqual(['https://prod', 'https://edge']);
    expect(values("$.servers[?@.url < 'https://e'].url")).toEqual(['https://dev']);
    expect(values("$.servers[?@.url > 'https://e'].url")).toEqual(['https://prod', 'https://edge']);
    expect(values("$.servers[?@.weight < 'https://e'].url")).toEqual([]);
    expect(values("$.servers[?@.weight >= 'x'].url")).toEqual([]);
  });

  it('reads every form of number literal', () => {
    const numbers = { n: [1.25, 10, 100, 1e12, -3] };
    const select = (path: string): unknown[] => query(numbers, path).map(({ value }) => value);
    expect(select('$.n[?@ == 1.25]')).toEqual([1.25]);
    expect(select('$.n[?@ == 10]')).toEqual([10]);
    expect(select('$.n[?@ == 1e+2]')).toEqual([100]);
    expect(select('$.n[?@ == 1E12]')).toEqual([1e12]);
    expect(select('$.n[?@ == -3]')).toEqual([-3]);
  });

  it('compares literals: strings either quote, numbers, true, false and null', () => {
    expect(values('$.servers[?@.description == "Prod"].weight')).toEqual([3]);
    expect(values('$.servers[?@.weight == 3].url')).toEqual(['https://prod']);
    expect(values('$.servers[?@.weight == -1.5e0].url')).toEqual([]);
    expect(values('$.servers[?3 == @.weight].url')).toEqual(['https://prod']);
    expect(values("$.paths[?@['x-flag'] == true]..description")).toEqual(['gone']);
    // A path item without the flag compares as Nothing, which is not `false`.
    expect(values("$.paths[?@['x-flag'] != false]..description")).toEqual(['ok', 'oops', 'gone']);
    expect(values('$[?@ == null]')).toEqual([null]);
  });

  it('compares whole values: arrays and objects are equal when their members are', () => {
    const data = {
      list: [{ a: [1, { b: 2 }] }, { a: [1, { b: 3 }] }, { a: [1] }, { a: { b: 2 } }, { a: { c: 2 } }, { a: { b: 2, c: 9 } }],
      ref: [1, { b: 2 }],
      obj: { b: 2 },
      wider: { b: 2, c: 3 },
    };
    expect(query(data, '$.list[?@.a == $.ref]').map(({ key }) => key)).toEqual([0]);
    expect(query(data, '$.list[?@.a == $.obj]').map(({ key }) => key)).toEqual([3]);
    // Every member, on both sides: `{ b: 2 }` is not `{ b: 2, c: 3 }`, nor is `{ b: 2, c: 9 }`.
    expect(query(data, '$.list[?@.a == $.wider]').map(({ key }) => key)).toEqual([]);
    expect(query(data, '$.list[?@.a != $.ref]').map(({ key }) => key)).toEqual([1, 2, 3, 4, 5]);
  });

  it('tests existence, and treats a query that selects nothing, or many, as Nothing', () => {
    expect(values('$.servers[?@.description].url')).toEqual(['https://dev', 'https://prod']);
    expect(values('$.servers[?!@.description].url')).toEqual(['https://edge']);
    expect(values('$.servers[?@.missing == @.other].url')).toEqual(['https://dev', 'https://prod', 'https://edge']);
    expect(values("$.servers[?@.* == 'https://dev'].url")).toEqual([]);
    expect(values('$.servers[?@.missing == null].url')).toEqual([]);
    expect(values('$.servers[?$.info.title == "Pets"].weight')).toEqual([1, 3, 2]);
  });

  it('combines tests with &&, ||, ! and parentheses, && binding tighter', () => {
    expect(values("$.servers[?@.weight > 1 && @.description == 'Prod'].url")).toEqual(['https://prod']);
    expect(values("$.servers[?@.weight == 1 || @.weight == 2].url")).toEqual(['https://dev', 'https://edge']);
    expect(values("$.servers[?@.weight == 1 || @.weight == 3 && @.description == 'Dev'].url")).toEqual(['https://dev']);
    expect(values("$.servers[?(@.weight == 1 || @.weight == 3) && @.description == 'Prod'].url")).toEqual(['https://prod']);
    expect(values('$.servers[?!(@.weight > 1)].url')).toEqual(['https://dev']);
    expect(values("$.servers[? @.weight==2 ].url")).toEqual(['https://edge']);
    expect(values('$.servers[? !@.description].url')).toEqual(['https://edge']);
    expect(values('$.servers[? ( @.weight == 1 ) ].url')).toEqual(['https://dev']);
    expect(values("$.servers[?@.weight > 0 && @.url && @.description == 'Prod' ].url")).toEqual(['https://prod']);
    expect(values("$.servers[?@.weight > 0 && @.weight < 9 && @.description == 'Prod'].url")).toEqual(['https://prod']);
    expect(values('$.servers[?@.weight == 5 || @.weight == 4 || @.weight == 1 ].url')).toEqual(['https://dev']);
  });
});

describe('what it does not read, each refused with a fix', () => {
  it('names the query, the character, and what to do', () => {
    expect(refusal('info')).toBe('cannot read the JSONPath `info`: a query starts with `$` at character 0. fix: write the query as RFC 9535 describes it');
    expect(refusal('$.servers[1:2]')).toBe('cannot read the JSONPath `$.servers[1:2]`: array slices are not read at character 11. fix: select the items by index, or with a filter');
    expect(refusal('$.servers[?length(@.url) > 1]')).toBe(
      'cannot read the JSONPath `$.servers[?length(@.url) > 1]`: function extensions are not read at character 11. fix: compare the value directly, or select it with a filter',
    );
    expect(refusal("$.servers[?'a']")).toBe(
      "cannot read the JSONPath `$.servers[?'a']`: a value on its own is not a test at character 14. fix: compare it with something, e.g. `@.name == …`",
    );
    expect(new JsonPathError('$', 'r', 'f')).toMatchObject({ name: 'JsonPathError' });
  });

  it('refuses malformed queries', () => {
    expect(refusal("$['open")).toContain('a string is not closed at character 7');
    expect(refusal('$.servers[0')).toContain('a `]` is expected at character 11');
    expect(refusal('$.servers[?(@.a == 1]')).toContain('a `)` is expected at character 20');
    expect(refusal('$.')).toContain('a name is expected after `.` at character 2');
    expect(refusal('$.1')).toContain('a name is expected after `.` at character 2');
    expect(refusal('$.servers[x1]')).toBe('cannot read the JSONPath `$.servers[x1]`: `x` is not a selector at character 10. fix: write the query as RFC 9535 describes it');
    expect(refusal('$.1a')).toContain('a name is expected after `.` at character 2');
    expect(refusal('$.servers[?@.a == ~length(@)]')).toContain('a value or a query is expected at character 18');
    expect(refusal('$.servers[?@.a == ]')).toContain('a value or a query is expected at character 18');
    expect(refusal('$.info x')).toContain('`x` is not read at character 7');
  });

  it('accepts blanks where the RFC does', () => {
    expect(parse(' $ .info ')).toEqual({ root: '$', segments: [{ descendant: false, selectors: [{ kind: 'name', name: 'info' }] }] });
    expect(parse('$.servers[ 0 , 1 ]').segments[1]?.selectors).toEqual([
      { kind: 'index', index: 0 },
      { kind: 'index', index: 1 },
    ]);
  });
});
