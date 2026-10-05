/**
 * `seniority/yaml`, held to `js-yaml` — the parser cosmiconfig loads — without depending on it.
 *
 * Every expected value in this file is what **js-yaml 5.4.2**'s `load` returns for the same
 * input, and the last `describe` proves it on every run: it feeds each fixture and each table
 * row to the js-yaml the workspace pins at its root (a devDependency, the way every graded
 * incumbent is pinned — never a dependency of this package) and requires the same answer.
 * js-yaml 5.4.2 is the version cosmiconfig 10.0.1 resolves (`^5.4.1`), so "the same as js-yaml"
 * is "the same as cosmiconfig". The rows marked `OURS` are the five where this parser's answer
 * is its own, and there the differential requires the two to *differ*, so a row cannot claim a
 * divergence that is not there.
 *
 * The fixtures are real: six of this repository's own YAML files (hooks, codecov, dependabot,
 * labels, a composite action, a workflow with `${{ }}` and `run: |` blocks), copied so an edit to
 * the live file cannot move a snapshot, plus `features.yaml`, which uses every construct once.
 *
 * A `.json` is js-yaml's answer, written by `JSON.stringify(load(text), null, 2)`. Regenerating
 * one is a deliberate act and never a fix for a red test.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

import { parse, YAMLException } from './yaml.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'yaml');
const fixtures = readdirSync(FIXTURES).filter((name) => /\.ya?ml$/u.test(name));

/** A row whose answer is this parser's and not js-yaml's; the differential below asserts they differ. */
const OURS = 'ours';

const SCALARS: ReadonlyArray<[text: string, value: unknown]> = [
  ['~', null],
  ['null', null],
  ['NULL', null],
  ['True', true],
  ['FALSE', false],
  ['yes', 'yes'],
  ['0', 0],
  ['-0', -0],
  ['+12', 12],
  ['012', 12],
  ['0x1f', 31],
  ['0o17', 15],
  ['0b11', '0b11'],
  ['-0x1F', '-0x1F'],
  ['1_000', '1_000'],
  ['9'.repeat(400), '9'.repeat(400)],
  ['1.5', 1.5],
  ['-.5', -0.5],
  ['1e3', 1000],
  ['1e400', '1e400'],
  ['.inf', Number.POSITIVE_INFINITY],
  ['-.Inf', Number.NEGATIVE_INFINITY],
  ['.NaN', Number.NaN],
  ['+.nan', '+.nan'],
  ['text', 'text'],
];

const TAGGED: ReadonlyArray<[text: string, value: unknown]> = [
  ['!!str 1', '1'],
  ['!!int "-0b11"', -3],
  ['!!int +0o7', 7],
  ['!!float "2"', 2],
  ['!!bool "False"', false],
  ['!!null ~', null],
  ['! 1', '1'],
  ['! [1]', [1]],
  ['!!map {a: 1}', { a: 1 }],
  ['!!seq\n- 1', [1]],
  ['!!map', {}],
  ['!!str', ''],
  ['a: !!seq', { a: [] }],
];

const STRUCTURE: ReadonlyArray<[text: string, value: unknown]> = [
  ['---\n', null],
  ['--- 1', 1],
  ['--- |\n  x\n', 'x\n'],
  ['---\n# nothing\n...\n', null],
  ['%YAML 1.2\n%TAG ! tag:example.com,2000:\n---\na: 1\n', { a: 1 }],
  ['a: 1\n...\n# after the end\n', { a: 1 }],
  ['text\n  continued\n\n\n  twice', 'text continued\n\ntwice'],
  ['a:\n  b: plain\n    folds # and stops\n', { a: { b: 'plain folds' } }],
  ['a: b\n  # a comment ends a plain scalar\n', { a: 'b' }],
  ['- a\n  b\n- c', ['a b', 'c']],
  ['- - a\n  - b\n-   - c', [['a', 'b'], ['c']]],
  ['- a: 1\n  b: 2\n- &x\n  c: 3\n- *x', [{ a: 1, b: 2 }, { c: 3 }, { c: 3 }]],
  ['a: &x\n- 1\nb: *x', { a: [1], b: [1] }],
  ['a: !!seq\n- 1', { a: [1] }],
  ['a: &x\nb: *x', { a: null, b: null }],
  ['&k a: 1\nb: *k', { a: 1, b: 'a' }],
  ['"k":\n  v', { k: 'v' }],
  ['- \n-\n', [null, null]],
  ['a:\n  - 1\n  -    2\nb: [3]', { a: [1, 2], b: [3] }],
  ['a:\n  b\n \t c', { a: 'b c' }],
  ['[\n1,\n2\n]', [1, 2]],
  ['[a, [b, {c: d}], [a "b"]]', ['a', ['b', { c: 'd' }], ['a "b"']]],
  ['{a: b, c, "d":e}', { a: 'b', c: null, d: 'e' }],
  ['{a: , b:}', { a: null, b: null }],
  ['[a: , &x b: c, *x]', [{ a: null }, { b: 'c' }, 'b']],
  ['[ &x , !!str ]', [null, '']],
  ['[a #c\n , b]', ['a', 'b']],
  ["'it''s' #c", "it's"],
  ["'a \n\n  b  '", 'a\nb  '],
  ['"a  \\t \n b"', 'a  \t b'],
  ['"a\\\n\n  b"', 'ab'],
  ['"\\0\\a\\b\\v\\f\\r\\e\\ \\N\\_\\L\\P\\\t|"', '\0\u0007\b\v\f\r\u001B \u0085\u00A0\u2028\u2029\t|'],
  ['|\n  a\n\n  b\n\n', 'a\n\nb\n'],
  ['|+\n\n', '\n'],
  ['|-\n  a\n  ', 'a'],
  ['>\n  a\n  b\n\n  c\n\n     d\n  e\n', 'a b\nc\n\n   d\ne\n'],
  ['>\n\n  a\n', '\na\n'],
  ['- |1\n  x\n', [' x\n']],
  ['a: |2-  # comment\n    x\n', { a: '  x' }],
  ['a: |\nb: 1', { a: '', b: 1 }],
  ['|\n x\n...\n', 'x\n'],
  ['|\n  no newline at the end', 'no newline at the end\n'],
  ['- a\n  - b', ['a - b']],
  ['[ &x\n  1, *x ]', [1, 1]],
  ['[ !!str\n  1 ]', ['1']],
  ['"\\U0010FFFF"', String.fromCodePoint(0x10_ff_ff)],
  ['a: b:[c]', { a: 'b:[c]' }],
  ['a: b:,c', { a: 'b:,c' }],
];

const REFUSALS: ReadonlyArray<[text: string, message: string, ours?: typeof OURS]> = [
  ['', 'expected a document, but the input is empty'],
  ['# only a comment\n', 'expected a document, but the input is empty'],
  ['a: 1\n---\nb: 2', 'expected a single document in the stream, but found more'],
  ['a: \u0007', 'the stream contains non-printable characters (1:5)'],
  ['a:\n\tb: 1', 'tab characters must not be used in indentation (2:1)'],
  ['a: b\nc', "expected ':' after a mapping key (2:2)"],
  ['a: 1\na: 2', 'duplicated mapping key (2:1)'],
  ['[a, b]: c', 'object-based map does not support complex keys (1:1)'],
  ['[a]:x', 'a whitespace character is expected after the key-value separator within a block mapping (1:5)'],
  ['"a\n b": c', 'end of the stream or a document separator is expected (2:4)'],
  ['- "a"\n  b', 'bad indentation of a sequence entry (2:3)'],
  ['%YAML 1.2', 'directives end mark is expected (1:10)'],
  ['%YAML 1.2\na: 1', 'directives end mark is expected (2:1)'],
  ['%YAML 1.2\n- a', 'directives end mark is expected (2:1)'],
  ['a: 1\n...\n---\nb: 2', 'expected a single document in the stream, but found more'],
  ['key: value\n  bad: indent', 'bad indentation of a mapping entry (2:6)'],
  ['a:\n    b: 1\n  c: 2', 'bad indentation of a mapping entry (3:3)'],
  ['a: - b', 'bad indentation of a mapping entry (1:4)'],
  ['a: "x" y', 'bad indentation of a mapping entry (1:8)'],
  ['a: @x', 'bad indentation of a mapping entry (1:4)'],
  ['a:\n  |x: 1\n  b: 2', 'a line break is expected (2:4)'],
  ['a: >\n\tb\n', 'tab characters must not be used in indentation (2:1)'],
  ['>\n    x\n  y\n', 'end of the stream or a document separator is expected (3:3)'],
  ['|\n x\n---\n', 'expected a single document in the stream, but found more'],
  ['a: 1\n|x: 1', 'end of the stream or a document separator is expected (2:1)'],
  ['a:\n  &x - 1', 'bad indentation of a mapping entry (2:6)'],
  ['- a\n b: 1', 'bad indentation of a sequence entry (2:3)'],
  ['- a\n  b: 1', 'bad indentation of a sequence entry (2:4)'],
  ['a:\n  x\n  y: 1', 'bad indentation of a mapping entry (3:4)'],
  ['text\nb: 1', 'end of the stream or a document separator is expected (2:2)'],
  ['"x" y', 'end of the stream or a document separator is expected (1:5)'],
  ['"k"\n: v', 'end of the stream or a document separator is expected (2:1)'],
  ['"k":v', 'a whitespace character is expected after the key-value separator within a block mapping (1:5)'],
  ['a: 1\n... x', 'end of the stream or a document separator is expected (2:5)'],
  ['a: [1, 2', 'unexpected end of the stream within a flow collection (1:9)'],
  ['x: ["a" b]', 'missed comma between flow collection entries (1:9)'],
  ['{a: 1 b: 2}', 'missed comma between flow collection entries (1:8)'],
  ['[a, *]', 'name of an alias node must contain at least one character (1:6)'],
  ['x: [1,,2]', "expected the node content, but found ',' (1:7)"],
  ['[#1]', 'missed comma between flow collection entries (1:2)'],
  ['a: [\n1]', 'deficient indentation (2:1)'],
  ['a: "x\ny"', 'deficient indentation (2:1)'],
  ['"a\n---\n"', 'unexpected end of the document within a double quoted scalar (2:1)'],
  ['a: "unterminated', 'unexpected end of the stream within a double quoted scalar (1:17)'],
  ["a: 'unterminated", 'unexpected end of the stream within a single quoted scalar (1:17)'],
  ['a: "\\q"', 'unknown escape sequence (1:6)'],
  ['a: "x\\x4g"', 'expected hexadecimal character (1:9)'],
  ['a: "\\UFFFFFFFF"', 'expected a Unicode code point (1:7)', OURS], // js-yaml returns a lone surrogate
  ['a: |0\n x', 'bad explicit indentation width of a block scalar; it cannot be less than one (1:5)'],
  ['a: |++\n x', 'repeat of a chomping mode identifier (1:6)'],
  ['a: |22\n x', 'repeat of an indentation width identifier (1:6)'],
  ['a: | x', 'a line break is expected (1:6)'],
  ['|-#\n x', 'a line break is expected (1:3)'],
  ['a: *nope', 'unidentified alias "nope" (1:5)'],
  ['a: * x', 'name of an alias node must contain at least one character (1:5)'],
  ['a: & x', 'name of an anchor node must contain at least one character (1:5)'],
  ['a: &x &y 1', 'duplication of an anchor property (1:7)'],
  ['a: !!str !!int 1', 'duplication of a tag property (1:10)'],
  ['a: &x *y', 'alias node should not have any properties (1:7)'],
  ['a: !!int x', 'cannot resolve a node with !<tag:yaml.org,2002:int> explicit tag (1:4)'],
  ['a: !!map x', 'cannot resolve a node with !<tag:yaml.org,2002:map> explicit tag (1:4)'],
  ['a: !custom 1', 'unknown scalar tag !<!custom> (1:4)'],
  ['a: !!seq {}', 'unknown mapping tag !<tag:yaml.org,2002:seq> (1:4)'],
  ['a: !!map [1]', 'unknown sequence tag !<tag:yaml.org,2002:map> (1:4)'],
  ['? a\n: b', 'explicit mapping keys are not supported (1:1)', OURS],
  ['? ', 'explicit mapping keys are not supported (1:1)', OURS],
  ['a: 1\n? b', 'explicit mapping keys are not supported (2:1)', OURS],
  [`${'['.repeat(101)}${']'.repeat(101)}`, 'nesting exceeded maxDepth (100) (1:101)', OURS], // js-yaml's limit and reason; its column is 100
];

describe('real configuration files read exactly as js-yaml reads them', () => {
  it('has the fixtures it claims', () => {
    expect(fixtures.sort()).toEqual(['action.yml', 'codecov.yml', 'dependabot.yml', 'features.yaml', 'labels.yml', 'lefthook.yml', 'workflow.yml']);
  });

  it.each(fixtures)('%s', (name) => {
    const text = readFileSync(join(FIXTURES, name), 'utf8');
    const expected: unknown = JSON.parse(readFileSync(join(FIXTURES, name.replace(/\.ya?ml$/u, '.json')), 'utf8'));
    expect(parse(text)).toStrictEqual(expected);
  });

  it('keeps `__proto__` an own key and never a prototype', () => {
    const value = parse('__proto__: {polluted: true}\n') as Record<string, unknown>;
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
    expect(Object.getOwnPropertyNames(value)).toEqual(['__proto__']);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('builds ordinary data properties, as js-yaml’s assignment does', () => {
    expect(Object.getOwnPropertyDescriptor(parse('a: 1'), 'a')).toEqual({ value: 1, writable: true, enumerable: true, configurable: true });
  });

  it('counts nesting, not collections: a long document of shallow ones is not "too deep"', () => {
    const entries = '- a: [1]\n  b:\n    - x\n'.repeat(120);
    expect(parse(entries)).toHaveLength(120);
  });

  it('reads CRLF line ends and a byte-order mark as if they were not there', () => {
    expect(parse('\uFEFFa: 1\r\nb:\r\n  - x\r\n')).toEqual({ a: 1, b: ['x'] });
  });
});

describe('the three YAML errors cosmiconfig’s own suite asserts', () => {
  // `failed-files.test.ts` and `failed-directories.test.ts`, verbatim: the reason and the
  // 1-based position are the whole assertion once cosmiconfig has prefixed the file name.
  it.each([
    ['foo: true: false', 'bad indentation of a mapping entry (1:10)'],
    ['found: true: broken', 'bad indentation of a mapping entry (1:12)'],
    ['found: thing: true', 'bad indentation of a mapping entry (1:13)'],
  ])('%j', (text, message) => {
    expect(() => parse(text)).toThrow(message);
  });
});

describe('scalars resolve by the core schema js-yaml 5 loads by default', () => {
  it.each(SCALARS)('%j', (text, value) => {
    expect(parse(text)).toStrictEqual(value);
  });

  it.each(TAGGED)('the tag in %j forces its type', (text, value) => {
    expect(parse(text)).toStrictEqual(value);
  });
});

describe('structure', () => {
  it.each(STRUCTURE)('%j', (text, value) => {
    expect(parse(text)).toStrictEqual(value);
  });

  it('returns the same object for an alias as for its anchor, as js-yaml does', () => {
    const value = parse('a: &x {n: 1}\nb: *x') as { a: unknown; b: unknown };
    expect(value.b).toBe(value.a);
  });
});

describe('refusals, by name and position', () => {
  // Every reason below is js-yaml's own wording, at js-yaml's position, except those marked
  // OURS: forms js-yaml reads that a configuration file has no use for, refused rather than
  // half-read. A YAMLException is the only thing the parser throws.
  it.each(REFUSALS)('%j', (text, message) => {
    let caught: unknown;
    try {
      parse(text);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(YAMLException);
    expect((caught as Error).message.split('\n')[0]).toBe(message);
  });

  it('carries js-yaml’s fields: the reason apart, the 0-based mark, and a snippet under the message', () => {
    let caught: YAMLException | undefined;
    try {
      parse('ok: 1\nfound: true: broken');
    } catch (error) {
      caught = error as YAMLException;
    }
    expect(caught?.name).toBe('YAMLException');
    expect(caught?.reason).toBe('bad indentation of a mapping entry');
    expect(caught?.mark).toMatchObject({ line: 1, column: 11, position: 17 });
    // The snippet is ours — js-yaml draws a wider one — and only the first line is asserted by anyone.
    expect(caught?.message).toBe('bad indentation of a mapping entry (2:12)\n\n 2 | found: true: broken\n                ^');
  });

  it('has no mark for a whole-stream refusal, as js-yaml has none', () => {
    const error = new YAMLException('expected a document, but the input is empty');
    expect(error.message).toBe('expected a document, but the input is empty');
    expect(error.mark).toBeUndefined();
  });
});

/** A read's value, or the first line of what it threw. */
const outcome = (read: () => unknown): { value: unknown } | { error: string } => {
  try {
    return { value: read() };
  } catch (error) {
    return { error: String((error as Error).message).split('\n')[0] as string };
  }
};

describe('the pinned js-yaml gives every answer above', () => {

  it.each(fixtures)('%s', (name) => {
    const expected: unknown = JSON.parse(readFileSync(join(FIXTURES, name.replace(/\.ya?ml$/u, '.json')), 'utf8'));
    expect(load(readFileSync(join(FIXTURES, name), 'utf8'))).toStrictEqual(expected);
  });

  it.each([...SCALARS, ...TAGGED, ...STRUCTURE])('%j', (text, value) => {
    expect(load(text)).toStrictEqual(value);
  });

  it.each(REFUSALS)('%j', (text, message, ours) => {
    if (ours === OURS) expect(outcome(() => load(text))).not.toEqual({ error: message });
    else expect(outcome(() => load(text))).toEqual({ error: message });
  });
});
