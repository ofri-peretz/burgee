/**
 * R7 — `wrap()` replaces wrap-ansi, so wrap-ansi grades it. Every case below runs through
 * both and the outputs must be identical, byte for byte, including the escape sequences:
 * a wrapper that only agrees on the visible text would still corrupt a coloured frame.
 *
 * The last block is a differential sweep over generated inputs rather than a list of
 * hand-picked ones, because the cases that break a wrapper are the ones nobody thought to
 * write down — a style opened across a break, a cluster split by an escape, a word exactly
 * as wide as the row. The generator is seeded, so a failure names the same input twice.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';
import wrapAnsi from 'wrap-ansi';

import { wrap, type WrapOptions } from './wrap.js';

/**
 * The grader is the specification, so which grader ran is part of the result. Without this
 * a hoisted wrap-ansi 8 — which is in this repo's tree, pulled in by other packages —
 * resolves here instead of the 10 the port was written against, and the sweep fails with
 * fifty ANSI diffs that say nothing about the port. Asserted, so the failure names itself.
 */
// Read beside the resolved entry: wrap-ansi 10 does not export `./package.json`.
const wrapAnsiManifest = join(dirname(createRequire(import.meta.url).resolve('wrap-ansi')), 'package.json');
const wrapAnsiVersion = (JSON.parse(readFileSync(wrapAnsiManifest, 'utf8')) as { version: string }).version;

it('is grading against the wrap-ansi major this was ported from', () => {
  expect(wrapAnsiVersion.split('.')[0]).toBe('10');
});

const ESC = '\u001B';
const red = (s: string): string => `${ESC}[31m${s}${ESC}[39m`;
const bold = (s: string): string => `${ESC}[1m${s}${ESC}[22m`;

/** The options log-update wraps with, plus the two defaults, plus the hard/word matrix. */
const OPTION_SETS: WrapOptions[] = [
  {},
  { trim: false, hard: true, wordWrap: false },
  { hard: true },
  { wordWrap: false },
  { trim: false },
  { trim: false, hard: true },
];

function bothAgree(input: string, columns: number, options: WrapOptions): void {
  expect(wrap(input, columns, options), `wrap(${JSON.stringify(input)}, ${columns}, ${JSON.stringify(options)})`).toBe(wrapAnsi(input, columns, options));
}

describe('wrap() agrees with wrap-ansi', () => {
  const CASES: [name: string, input: string, columns: number][] = [
    ['plain text under the width', 'hello world', 20],
    ['plain text over the width', 'the quick brown fox jumps over the lazy dog', 12],
    ['a word longer than the row', 'supercalifragilisticexpialidocious', 10],
    ['a word exactly the width of the row', 'abcde fghij', 5],
    ['leading and trailing spaces', '   padded   ', 8],
    ['an empty string', '', 10],
    ['only spaces', '     ', 10],
    ['newlines already in the text', 'one\ntwo\nthree', 10],
    ['a trailing newline', 'one\n', 10],
    ['consecutive newlines', 'one\n\n\ntwo', 10],
    ['a tab', 'a\tb', 20],
    ['a tab past a stop', 'abcdefghij\tk', 40],
    ['CRLF', 'one\r\ntwo', 10],
    ['a colour that fits', red('hello'), 20],
    ['a colour broken across rows', red('hello world again'), 7],
    ['nested styles broken across rows', bold(red('hello world again')), 7],
    ['a style opened and never closed', `${ESC}[31mred forever and ever`, 8],
    ['a reset in the middle', `${ESC}[31mred${ESC}[0m plain again`, 6],
    ['a 256-colour code', `${ESC}[38;5;9mcolour across the break${ESC}[39m`, 8],
    ['a truecolour code', `${ESC}[38;2;255;0;0mcolour across the break${ESC}[39m`, 8],
    ['a background colour', `${ESC}[41mon red across the break${ESC}[49m`, 8],
    ['an underline colour', `${ESC}[58;5;9munderlined across the break${ESC}[59m`, 8],
    ['a hyperlink', `${ESC}]8;;https://example.com\u0007a link across rows${ESC}]8;;\u0007`, 8],
    ['an escape that is not a sequence', `${ESC}nonsense here`, 6],
    ['wide characters', '古池や蛙飛び込む水の音', 8],
    ['emoji', '🦄 🦄 🦄 🦄 🦄 🦄', 7],
    ['a ZWJ sequence', '👩‍👩‍👦 family family family', 9],
    ['combining marks', 'éééééé', 3],
    ['a colour inside a wide run', `古${ESC}[31m池や蛙${ESC}[39m飛`, 4],
    ['one column', 'abc def', 1],
  ];

  for (const [name, input, columns] of CASES) {
    describe(name, () => {
      it.each(OPTION_SETS.map((options) => [JSON.stringify(options), options] as const))('%s', (_label, options) => {
        bothAgree(input, columns, options);
      });
    });
  }
});

/** A tiny seeded generator, so a failing sweep names the same string on the next run. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_00_00_00_00;
  };
}

const PIECES = ['a', 'bb', 'ccc', ' ', '  ', '\n', '\t', '古', '🦄', 'é', `${ESC}[31m`, `${ESC}[39m`, `${ESC}[1m`, `${ESC}[22m`, `${ESC}[0m`, `${ESC}[38;5;9m`, `${ESC}[41m`, `${ESC}]8;;https://x.example\u0007`, `${ESC}]8;;\u0007`, ESC];
const SWEEP_INPUTS = 200;
const MAX_PIECES = 14;
const MAX_COLUMNS = 12;

describe('wrap() agrees with wrap-ansi on generated input', () => {
  it.each(OPTION_SETS.map((options) => [JSON.stringify(options), options] as const))('%s', (_label, options) => {
    const random = makeRandom(20_260_908);
    for (let index = 0; index < SWEEP_INPUTS; index += 1) {
      const pieces = 1 + Math.floor(random() * MAX_PIECES);
      let input = '';
      for (let piece = 0; piece < pieces; piece += 1) input += PIECES[Math.floor(random() * PIECES.length)] ?? '';
      bothAgree(input, 1 + Math.floor(random() * MAX_COLUMNS), options);
    }
  });
});
