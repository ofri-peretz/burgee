/**
 * dotenv 18's `{ fast: true }` scanner, held to two things: a table of values pinned from
 * dotenv 18.0.5 itself (each row's expectation was read off the real package, not written by
 * hand), and agreement with the regular-expression parser over a grid of the shapes upstream's
 * own suite combines — which is the property dotenv's `test-parse-fast.js` asserts.
 */
import { describe, expect, it } from 'vitest';

import { parseFast } from './dotenv-scan.js';
import { parse } from './dotenv.js';

/** `[source, what dotenv 18.0.5 parses it to]` — its regex and its scanner agree on every row. */
const PINNED: readonly (readonly [string, Record<string, string>])[] = [
  ['BASIC=basic', { BASIC: 'basic' }],
  ['export KEY=value', { KEY: 'value' }],
  ['KEY: value', { KEY: 'value' }],
  ['EMPTY=', { EMPTY: '' }],
  ["SINGLE='single'", { SINGLE: 'single' }],
  ['BACKTICK=`backtick`', { BACKTICK: 'backtick' }],
  ['DOUBLE="line one\\nline two"', { DOUBLE: 'line one\nline two' }],
  ['INLINE=value # comment', { INLINE: 'value' }],
  ['HASH="value#notcomment"', { HASH: 'value#notcomment' }],
  ['EQUALS==value', { EQUALS: '=value' }],
  ['# comment only\n', {}],
  ['', {}],
  ['KEY=val\r\nOTHER=ok\r', { KEY: 'val', OTHER: 'ok' }],
  ['MULTI="one\ntwo"', { MULTI: 'one\ntwo' }],
  ['ESCAPED="say \\"hi\\""', { ESCAPED: 'say \\"hi\\"' }],
  ['\ufeffBASIC=basic', { BASIC: 'basic' }],
  ['A="\\\\"\nB=plain\nC="quoted"\nD=last\n', { A: '\\\\', B: 'plain', C: 'quoted', D: 'last' }],
  ['A=\n\n"hello\nworld"', { A: 'hello\nworld' }],
  ["A=\n'b'", { A: 'b' }],
  ['\fA=1', { A: '1' }],
  ['\u00a0A=1', { A: '1' }],
  ['TOKEN="abc" oops', { TOKEN: '"abc" oops' }],
  ['KEY="line one\\nline two', { KEY: '"line one\nline two' }],
  ['KEY="line one\\rline two', { KEY: '"line one\rline two' }],
  ['KEY="a" "b"', { KEY: 'a" "b' }],
  ['INVALID\nNEXT=ok', { NEXT: 'ok' }],
  ['KEY\n=ok', { KEY: 'ok' }],
  ['export\u00a0KEY\f=\u000bvalue\u00a0', { KEY: 'value' }],
  ['KEY:\u00a0value', { KEY: 'value' }],
  ['KEY=\n\n`one\ntwo`\nNEXT=ok', { KEY: 'one\ntwo', NEXT: 'ok' }],
  ['KEY="abc" # comment\nNEXT=ok', { KEY: 'abc', NEXT: 'ok' }],
  ['KEY=\n"unterminated\nNEXT=ok', { KEY: '', NEXT: 'ok' }],
  ['A:\nfoo', { A: 'foo' }],
  ['export =value', { export: 'value' }],
  ['export : value\nNEXT=ok', { NEXT: 'ok' }],
  ['export\nexport KEY=value', { KEY: 'value' }],
  ['export \n\nexport KEY=value\nNEXT=ok', { KEY: 'value', NEXT: 'ok' }],
  ['A="x"\u2028B=ok', { A: 'x', B: 'ok' }],
  ['# comment\u2029B=ok', { B: 'ok' }],
  ['A=x # comment\u2028B=ok', { A: 'x', B: 'ok' }],
  ['invalid\u2028B=ok', { B: 'ok' }],
  ['A=x\u2028B=ok', { A: 'x\u2028B=ok' }],
  ['A=\n"a\\\\"b"\nB=ok', { A: 'a\\\\"b', B: 'ok' }],
  ['A="a\\"', { A: 'a\\' }],
  ['A="a\\" # c', { A: 'a\\' }],
  ['A:b', {}],
  ['A:', {}],
  ['A', {}],
  ['exportA=1', { exportA: '1' }],
  ['enabled=yes', { enabled: 'yes' }],
  ['exporter=1', { exporter: '1' }],
  ['export', {}],
  ['=x', {}],
  ['-A.b_c=1', { '-A.b_c': '1' }],
  ['A="x\\nb" # c', { A: 'x\nb' }],
  ["A='open", { A: "'open" }],
  ['A=`x`junk', { A: '`x`junk' }],
  ["A='a' 'b'", { A: "a' 'b" }],
  ['A="a\\n', { A: '"a\n' }],
  ['A= "spaced" ', { A: 'spaced' }],
  ['A="x"\t\nB=1', { A: 'x', B: '1' }],
  ['\u3000A=1', { A: '1' }],
  ['A=\u0085x', { A: '\u0085x' }],
  ['export   ', {}],
  ['export \n', {}],
  ['A="', { A: '"' }],
];

describe('the scanner, against values pinned from dotenv 18.0.5', () => {
  it.each(PINNED)('%j', (src, expected) => {
    expect(parseFast(src)).toEqual(expected);
    expect(parse(src)).toEqual(expected);
  });

  it('reads a Buffer, as `config` hands one over', () => {
    expect(parseFast(Buffer.from('A=1\r\nB=2'))).toEqual({ A: '1', B: '2' });
  });

  it('keeps `__proto__` as an entry rather than a prototype write', () => {
    const out = parseFast('__proto__=polluted');
    // eslint-disable-next-line conventions/consistent-existence-index-check -- `in` cannot ask this: `'__proto__' in {}` is true for every object, through the inherited accessor. Only an own entry proves the key was kept rather than written to the prototype.
    expect(Object.hasOwn(out, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
  });
});

describe('the scanner’s two character tables', () => {
  /**
   * The scanner hand-codes JavaScript's whitespace as a list of code points, where the regex
   * parser says `\s` and `trim()`. Every code unit is checked: around a key and around an
   * unquoted value, the two must agree on which characters are space. A missing or extra code
   * point in the list shows up as one character here.
   */
  it('treats exactly JavaScript’s whitespace as whitespace, for every code unit', () => {
    const disagree: string[] = [];
    // eslint-disable-next-line secure-coding/no-unchecked-loop-condition -- bounded by a constant: the 65,536 UTF-16 code units, each once.
    for (let code = 0; code <= 0xffff; code++) {
      const ch = String.fromCharCode(code);
      // CR is normalised away and the line ends end a line in both; neither is a space question.
      if (ch === '\r' || ch === '\n' || ch === ' ' || ch === ' ') continue;
      const src = `${ch}A=${ch}v${ch}\nB=1`;
      if (JSON.stringify(parseFast(src)) !== JSON.stringify(parse(src))) disagree.push(code.toString(16));
    }
    expect(disagree).toEqual([]);
  });

  it('reads exactly `[A-Za-z0-9_.-]` as a key character, for every ASCII code', () => {
    const disagree: string[] = [];
    for (let code = 0; code < 128; code++) {
      const ch = String.fromCharCode(code);
      if (ch === '\r' || ch === '\n') continue;
      const src = `K${ch}=1\n${ch}K=2`;
      if (JSON.stringify(parseFast(src)) !== JSON.stringify(parse(src))) disagree.push(code.toString(16));
    }
    expect(disagree).toEqual([]);
    expect(parseFast('AZaz09_.-=1')).toEqual({ 'AZaz09_.-': '1' });
  });
});

describe('the scanner agrees with the regular expression', () => {
  // The grid upstream's `fast parse matches classic across quoted value combinations` walks,
  // with more separators and suffixes.
  const values = ['', 'plain', '"a"', "'a'", '`a`', '"a" "b"', '"a\\n', '"a\\r', '"a\\"', '"a\\\\"', '"a\\\\"b"', '"a\nb"', '"a\nb"junk', '"a\\"#x"', '"a\n"b"\nc"'];
  const separators = ['=', '= ', '=\n', ': ', ':\n', ':\t', ' = ', ':', '=\n\n'];
  const suffixes = ['', '\nB=ok', '\nB="b"', '#end', ' junk', ' # c\nB=1'];
  const grid = separators.flatMap((sep) => values.flatMap((value) => suffixes.map((suffix) => `A${sep}${value}${suffix}`)));

  it(`on all ${String(grid.length)} combinations`, () => {
    expect(grid.filter((src) => JSON.stringify(parseFast(src)) !== JSON.stringify(parse(src)))).toEqual([]);
  });

  /**
   * Where dotenv 18.0.5's two parsers do **not** agree, and so neither do ours. Separate quoted
   * segments followed by a U+2028. Both read the whole line as one unquoted value, since neither
   * closing quote is followed by a line end. The regex parser then strips quotes with an
   * `m`-flagged pattern, and JavaScript's `$` matches before a U+2028, so it pairs the first `"`
   * with the one before the separator; the scanner compares the value's first and last
   * characters and strips nothing. Both answers were read off dotenv itself.
   */
  it('except where dotenv’s own two parsers differ, which is pinned rather than smoothed', () => {
    const src = 'A="a" "b" B=ok';
    expect(parse(src)).toEqual({ A: 'a" "b B=ok' });
    expect(parseFast(src)).toEqual({ A: '"a" "b" B=ok' });
  });

  it.each(['"', "'", '`'])('with backslash runs before a %s on a later line', (quote) => {
    const sources = [1, 2, 3, 4].flatMap((count) => {
      const slashes = '\\'.repeat(count);
      return ['', '\nB=ok', '# comment'].flatMap((suffix) => [`A=\n${quote}a${slashes}${quote}${suffix}`, `A=\n${quote}a${slashes}${quote}b${quote}${suffix}`]);
    });
    expect(sources.filter((src) => JSON.stringify(parseFast(src)) !== JSON.stringify(parse(src)))).toEqual([]);
  });

  /**
   * Past 4,096 characters the scanner finds an unquoted value's comment by walking the line
   * rather than by `indexOf` over the whole source — upstream's bound, so a long file without a
   * `#` is not scanned to its end once per line. Both routes must give the regex's answer.
   */
  it('on a source long enough to take the bounded comment scan', () => {
    const filler = Array.from({ length: 400 }, (_, i) => `K${String(i)}=value${String(i)}`).join('\n');
    for (const tail of ['\nA=x # c\nB=2', '\nA=x\nB=2', '\nA="q" # c', '\nA=x', '\nA=x#']) {
      const src = `${filler}${tail}`;
      expect(src.length).toBeGreaterThan(4096);
      expect(parseFast(src)).toEqual(parse(src));
    }
  });
});
