/**
 * `burgee migrate`'s scanner on the inputs migrate-lexer.test.ts does not write: a regular
 * expression with a character class, trivia of every kind, the call table entry by entry, and
 * the clause an `export … from` carries. Each one puts the site after the input, so a scanner
 * that misreads it either loses the site or gains one.
 */
import { describe, expect, it } from 'vitest';

import { bindingsOf, scan, tokensOf } from './migrate.js';

const specifiers = (source: string): string[] => scan(source).sites.map((s) => s.specifier);
const texts = (source: string): string[] => tokensOf(source).map((t) => t.text);

describe('a regular expression', () => {
  it('ends at its closing slash, which a character class does not hold', () => {
    expect(specifiers('const r = /x/; import a from "commander";\n')).toEqual(['commander']);
    expect(specifiers('const r = /[a]/; import a from "commander";\n')).toEqual(['commander']);
  });

  it('holds a slash and a quote inside a character class', () => {
    expect(specifiers('const r = /[/\']/; import a from "commander";\n')).toEqual(['commander']);
    expect(specifiers('const r = /x[/]y/; import a from "commander";\n')).toEqual(['commander']);
  });

  it('is one token, closing slash included', () => {
    expect(texts('/x/')).toEqual(['/x/']);
  });

  it('never follows a name, a number, or the end of a word', () => {
    // After `a`, each `/` divides; read as a regex, `/ b /` would swallow the quote after it.
    expect(specifiers('a / b / c; import x from "commander";\n')).toEqual(['commander']);
    expect(texts('a / b')).toEqual(['a', '/', 'b']);
  });
});

describe('a string', () => {
  it('left open ends at its newline, and the next line is read', () => {
    expect(specifiers("x('a\nimport b from \"commander\";\n")).toEqual(['commander']);
  });
});

describe('trivia', () => {
  it('skips a tab, a carriage return and a newline between the keyword and the specifier', () => {
    expect(specifiers("import\t'chalk';")).toEqual(['chalk']);
    expect(specifiers("import\r'chalk';")).toEqual(['chalk']);
    expect(specifiers("import\n'chalk';")).toEqual(['chalk']);
  });

  it('skips a semicolon as it skips a space', () => {
    expect(texts('a;b')).toEqual(['a', 'b']);
  });

  it('counts the newlines it skips', () => {
    expect(scan("\n\nimport a from 'commander'").sites[0]?.line).toBe(3);
  });

  it('starts a line comment at its own slashes, not at the word before them', () => {
    expect(texts('a//c\nb')).toEqual(['a', 'b']);
  });

  it('ends a block comment at the first */ after its opening, and steps past it', () => {
    expect(texts('/*/ x */ y')).toEqual(['y']);
    expect(texts('/**/y')).toEqual(['y']);
    expect(texts('/**/ab')).toEqual(['ab']);
  });
});

describe('the specifier positions', () => {
  it('reads a quote after anything else as no specifier', () => {
    expect(specifiers("const x = 'commander';")).toEqual([]);
  });

  it.each(['vi.mock', 'vi.doMock', 'vi.unmock', 'vi.doUnmock', 'jest.mock', 'jest.doMock', 'jest.unmock', 'jest.unstable_mockModule', 'require.resolve'])('reads %s as naming the module and binding nothing', (call) => {
    expect(scan(`${call}('chalk');`).sites).toMatchObject([{ specifier: 'chalk', refers: true }]);
  });

  it.each(['jest.requireActual', 'jest.requireMock'])('reads %s as loading the module the way require does', (call) => {
    expect(scan(`${call}('chalk');`).sites).toMatchObject([{ specifier: 'chalk', require: true }]);
  });

  it('reads vi.mock as a call only when vi is not somebody’s property', () => {
    expect(scan("x.vi.mock('chalk');").sites).toEqual([]);
  });

  it('still reads vi.mock after a comparison', () => {
    expect(scan("if (a < b) vi.mock('chalk');").sites).toMatchObject([{ specifier: 'chalk', refers: true }]);
  });

  it('carries the clause of an export … from, and marks it neither a require nor a mock', () => {
    expect(scan("export { a } from 'commander';").sites[0]).toStrictEqual({ specifier: 'commander', start: 19, end: 28, line: 1, clause: ['{', 'a', '}'] });
  });

  it('gives a bare import an empty clause', () => {
    expect(scan("import 'chalk';").sites[0]?.clause).toEqual([]);
  });

  it('counts the lines a template spans', () => {
    expect(scan("`a\nb`;\nimport x from 'commander'").sites[0]?.line).toBe(3);
  });
});

describe('tokensOf', () => {
  it('gives a quoted literal its value, and nothing else one, and ends at the end of the text', () => {
    expect(tokensOf("a 'b'")).toStrictEqual([{ text: 'a', line: 1 }, { text: "'b'", line: 1, value: 'b' }]);
  });
});

describe('bindingsOf', () => {
  it('reads names only between a { and the } after it', () => {
    expect(bindingsOf(['a'])).toEqual({ typeOnly: false, names: [] });
    expect(bindingsOf(['{', 'a', ',', 'b'])).toEqual({ typeOnly: false, names: [] });
    expect(bindingsOf(['a', '}'])).toEqual({ typeOnly: false, names: [] });
    expect(bindingsOf(['{', 'a', '}'])).toEqual({ typeOnly: false, names: ['a'] });
  });
});
