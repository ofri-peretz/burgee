/**
 * Locks for two defects `burgee/yargs/parser` carried over from yargs-parser 22 verbatim.
 *
 * 1. `isUnknownOption`'s flag regexes backtracked. With `unknown-options-as-args`, every
 *    `-`-prefixed argument runs through five of them: `/^-+([^=]+?\d+)$/` is quadratic on a
 *    run of digits that does not end the string, and `/^-+([^=]+?)\W+.*$/` is cubic on a run
 *    of spaces or punctuation followed by a line break. Measured on the unfixed code, node
 *    v24.12.0, macOS: `-a` + `'! '` x 500 / 1,000 / 2,000 + `a\na` took 173 / 1,412 / 10,543 ms
 *    in the second regex alone — twice the input, eight times the time. The locks below time a
 *    parse at two sizes and hold the ratio, not the milliseconds (`__fixtures__/growth.ts`).
 * 2. `setKey` descended into a `null` parent. `{ a: null }` from one config and `a.b` from a
 *    default or a second config threw "Cannot read properties of null (reading 'b')" out of
 *    the parse, where `hasKey` had already read the `null` as an absent parent.
 *
 * The rewrites must answer as the regexes did — yargs' own suite grades this parser — so the
 * first is also checked against the original regexes over every short string of the
 * characters that matter.
 */
import { describe, expect, it } from 'vitest';
import upstreamParser from 'yargs-parser';

import { growth, LINEAR, said } from '../__fixtures__/growth.js';
import yargsParser from '../yargs-parser.js';

import { flagEndingInDigits, flagEndingInHyphen, flagEndingInNonWordCharacters, flagWithEquals, normalFlag } from './flag-shapes.js';

/** yargs-parser 22's regexes, verbatim — the reference each function is held to. */
const UPSTREAM: [string, RegExp, (s: string) => string | undefined][] = [
  ['flagWithEquals', /^-+([^=]+?)=[\s\S]*$/, flagWithEquals],
  ['normalFlag', /^-+([^=]+?)$/, normalFlag],
  ['flagEndingInHyphen', /^-+([^=]+?)-$/, flagEndingInHyphen],
  ['flagEndingInDigits', /^-+([^=]+?\d+)$/, flagEndingInDigits],
  ['flagEndingInNonWordCharacters', /^-+([^=]+?)\W+.*$/, flagEndingInNonWordCharacters],
];

/** Every string over `alphabet` up to `max` long. */
function* strings(alphabet: string[], max: number, prefix = ''): Generator<string> {
  yield prefix;
  if (max === 0) return;
  for (const c of alphabet) yield* strings(alphabet, max - 1, prefix + c);
}

describe('the flag shapes answer as the upstream regexes did', () => {
  it('on every short string of dashes, `=`, word, digit, space, punctuation and line terminators', () => {
    // `-` and `=` steer the anchors, `a` `1` `_` are \w, ` ` `!` are \W, and `\n` `\r` `\u2028`
    // are the terminators `.` cannot cross.
    const alphabet = ['-', '=', 'a', '1', '_', ' ', '!', '\n', '\r', '\u2028'];
    const mismatches: string[] = [];
    let checked = 0;
    for (const s of strings(alphabet, 5)) {
      for (const [name, regex, ours] of UPSTREAM) {
        if (ours(s) !== regex.exec(s)?.[1]) mismatches.push(`${name} ${JSON.stringify(s)}`);
        checked++;
      }
    }
    expect(mismatches.slice(0, 10)).toEqual([]);
    expect(checked).toBeGreaterThan(500_000);
  });
});

describe('unknown-options-as-args classifies a long argument in linear time', () => {
  const parse = (arg: string) => yargsParser([arg], { configuration: { 'unknown-options-as-args': true } });

  // Each size is picked so the smaller parse takes about 10 ms here (node v24.12.0, macOS, under
  // load): 100,000 `'! '` read 11.3 -> 44.5 ms and 200,000 digits 9.5 -> 39.3 ms, and the ratio
  // stayed within 3.9-4.6 over repeated runs. Upstream's regexes read 38x (cubic, 100 `'! '`) and
  // 14x (quadratic, 2,000 digits), at sizes they can finish.
  it('a run of punctuation before a line break (cubic upstream)', () => {
    const arg = (n: number) => `-a${'! '.repeat(n)}a\na`;
    expect(parse(arg(100_000))._).toEqual([arg(100_000)]);
    const g = growth(arg, parse, 100_000);
    expect(g.ratio, said(g)).toBeLessThan(LINEAR);
  });

  it('a run of digits that does not end the argument (quadratic upstream)', () => {
    const arg = (n: number) => `--${'1'.repeat(n)}x\n`;
    expect(parse(arg(200_000))._).toEqual([arg(200_000)]);
    const g = growth(arg, parse, 200_000);
    expect(g.ratio, said(g)).toBeLessThan(LINEAR);
  });

  it('sorts known and unknown flags of every shape exactly as yargs-parser 22 does', () => {
    const opts = { boolean: ['a1', 'x', 'b'], string: ['y'], configuration: { 'unknown-options-as-args': true } };
    const args = ['--a1', '--y=v', '--x!', '--x-', '-b1', '--b.', '--no-b', '--nope!', '--nope=1', '---x', '--=x', '-', '--', '-1', '--x\n!', '-a1 !', 'plain'];
    for (const arg of args) expect(yargsParser([arg, 'tail'], opts), JSON.stringify(arg)).toEqual(upstreamParser([arg, 'tail'], opts));
  });
});

describe('a null parent in config is an absent one, not a crash', () => {
  it('a default under a key a config set to null', () => {
    expect(yargsParser([], { configObjects: [{ a: null }], default: { 'a.b': 1 } }).a).toEqual({ b: 1 });
  });

  it('a second config nesting under the first one’s null', () => {
    expect(yargsParser([], { configObjects: [{ a: null }, { a: { b: 1 } }] }).a).toEqual({ b: 1 });
  });

  it('a null that nothing nests under is still null', () => {
    expect(yargsParser([], { configObjects: [{ a: null }] }).a).toBeNull();
  });
});
