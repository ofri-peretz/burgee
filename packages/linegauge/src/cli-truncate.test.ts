/**
 * `linegauge/cli-truncate` and `linegauge/widest-line` — the drop-in paths that cli-truncate's
 * and widest-line's own suites grade in `compat-oracle` (`graded-override-targets` R5, R6).
 *
 * Those suites run in another process, so these cases hold the same façades here, differentially:
 * each input goes through the incumbent the workspace installs (cli-truncate 6.2.0, widest-line
 * 6.0.0, the graded releases) and through ours, and the two must agree byte for byte. The table
 * reaches every branch — each position with and without `space` and `preferTruncationOnSpace`,
 * a styled text and a styled mark, a cut that ends on a bare `m` and one that opens on a
 * sequence that is not SGR, the one-column and zero-column budgets, and every refusal.
 *
 * The last five texts are 6.2.0's: `preferTruncationOnSpace` finds its space by terminal column,
 * not by UTF-16 index, so a style, a wide character or a zero-width one before the break no
 * longer moves the search, and the text after the mark loses its leading spaces without a
 * `trim()` that also took the trailing ones and the closing style.
 */
import cliTruncateIncumbent from 'cli-truncate';
import { describe, expect, it } from 'vitest';
import widestLineIncumbent from 'widest-line';

import cliTruncate, { type Options } from './cli-truncate.js';
import widestLine from './widest-line.js';

const RED = '\u001B[31m';
const RESET = '\u001B[39m';
const BOLD = '\u001B[1m';

const texts = ['unicorn', 'unicorns rainbow dragons', `${RED}unicorn${RESET}`, `${BOLD}${RED}unicorns rainbow${RESET}\u001B[22m`, '안녕하세요', 'a🈀b🈀c', `\u001B[3xunicorn`, `unicorn\u001B[3`, 'dream mm summer mm', `unicorns \u001B[2Krainbow`, `${RED}unicorns rainbow dragons${RESET}`, '古古 古古古 古古 古', 'a\u200Bb c\u200Bd e\u200Bf g\u200Bh', 'unicorns   rainbow   ', `${BOLD}unicorns${RESET}   rainbow  \u001B[22m`];
const positions = ['start', 'middle', 'end'] as const;
const shapes: Options[] = [{}, { space: true }, { preferTruncationOnSpace: true }, { truncationCharacter: '...' }, { truncationCharacter: `${RED}~${RESET}` }, { space: true, truncationCharacter: '+' }];
const budgets = [-1, 0, 1, 2, 3, 4, 5, 8, 12, 20, 40];

const cases = texts.flatMap((text) => positions.flatMap((position) => shapes.flatMap((shape) => budgets.map((columns) => [text, columns, { ...shape, position }] as const))));

describe('linegauge/cli-truncate agrees with cli-truncate 6.2.0', () => {
  it('finds cases to compare, so the agreement cannot be vacuous', () => {
    expect(cases.length).toBeGreaterThan(1000);
  });

  it('returns what the incumbent returns, for every text, position, option and budget', () => {
    const differ = cases.filter(([text, columns, options]) => cliTruncate(text, columns, options) !== cliTruncateIncumbent(text, columns, options));
    expect(differ).toEqual([]);
  });

  // The leading run of styles a start cut puts the mark inside is SGR with digit and `;`
  // parameters only, as cli-truncate reads it. A colon-form truecolour opener (`ESC[38:2::…m`)
  // ends that run, so the mark goes before it. Without `preferTruncationOnSpace` nothing here
  // reads Node's `stripVTControlCharacters`, which mis-strips the colon form before v24.21, so
  // the incumbent's answer is the same on every Node.
  it('puts a start mark before a colon-form opener it does not read as SGR, as the incumbent does', () => {
    const text = `\u001B[38:2::255:0:0municorns rainbow${RESET}`;
    expect(cliTruncate(text, 8, { position: 'start' })).toBe(`…\u001B[38:2::255:0:0mrainbow${RESET}`);
    expect(cliTruncate(text, 8, { position: 'start' })).toBe(cliTruncateIncumbent(text, 8, { position: 'start' }));
  });

  it('defaults to the end and the ellipsis', () => {
    expect(cliTruncate('unicorn', 4)).toBe('uni…');
  });

  it.each([
    [[1, 2, {}], 'Expected `input` to be a string, got number'],
    [['x', '2', {}], 'Expected `columns` to be a number, got string'],
    [['x', Number.POSITIVE_INFINITY, {}], 'Expected `columns` to be a finite number, got Infinity'],
    [['x', 2, { position: 'left' }], 'Expected `options.position` to be either `start`, `middle` or `end`, got left'],
    [['x', 2, { truncationCharacter: 1 }], 'Expected `options.truncationCharacter` to be a string, got number'],
  ] as const)('refuses what the incumbent refuses, with its words (%#)', (args, message) => {
    const [text, columns, options] = args as unknown as [string, number, Options];
    expect(() => cliTruncate(text, columns, options)).toThrow(new TypeError(message));
    expect(() => cliTruncateIncumbent(text, columns, options)).toThrow(new TypeError(message));
  });
});

describe('linegauge/widest-line agrees with widest-line 6.0.0', () => {
  it.each(['', 'a', 'a\nbe', '古\n\u001B[1m@\u001B[22m', 'one\n\ntwo three\n😀😀'])('%j', (text) => {
    expect(widestLine(text)).toBe(widestLineIncumbent(text));
  });
});

describe('where the mark goes around the sequences at the cut', () => {
  it.each([
    ['inside a leading 256-colour style', '\u001B[38;5;208municorns\u001B[39m', [5, { position: 'start' }], '\u001B[38;5;208m…orns\u001B[39m'],
    ['after a reset with no parameters, cut from the start', `${RED}ab\u001B[mcdefg`, [4, { position: 'start' }], '…efg'],
    ['before a text that only ends like a sequence', 'abcdefx\u001B[1m', [4, {}], 'abc…'],
    ['after a reset with no parameters, cut from the end', 'ab\u001B[mcdef', [4, {}], 'ab\u001B[mc…'],
    ['with no space when the cut prefers a space', 'abc def ghi', [6, { space: true, preferTruncationOnSpace: true, position: 'end' }], 'abc…'],
    // Text that only looks like part of a sequence is text: the mark goes where the text ends.
    ['before text shaped like an SGR without its escape, from the start', 'xxxxxa[1mb', [6, { position: 'start' }], '…a[1mb'],
    ['before a link opener whose URI begins like an SGR', '\u001B]8;;mailto:a\u0007abcdefghij\u001B]8;;\u0007', [6, { position: 'start' }], '…\u001B]8;;mailto:a\u0007fghij\u001B]8;;\u0007'],
    ['after a CSI cut short by a character no CSI holds', 'abc\u001B[12édefg', [5, {}], 'abc\u001B[12é…'],
    ['before a parameterless reset kept as written', `${RED}abc\u001B[mdef`, [4, {}], `${RED}abc…\u001B[m`],
    ['after text that ends in m', 'abcmxyz', [5, {}], 'abcm…'],
    ['after text shaped like an SGR without its escape, from the end', 'xa[1mbcdef', [6, {}], 'xa[1m…'],
    ['after a bare escape followed by text ending in m', 'q\u001Bz1mabcdef', [5, {}], 'q\u001Bz1m…'],
  ] as [string, string, [number, Options], string][])('%s', (_name, text, [columns, options], expected) => {
    expect(cliTruncate(text, columns, options)).toBe(expected);
    expect(cliTruncateIncumbent(text, columns, options)).toBe(expected);
  });
});
