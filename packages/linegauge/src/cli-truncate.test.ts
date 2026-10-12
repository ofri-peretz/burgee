/**
 * `linegauge/cli-truncate` and `linegauge/widest-line` — the drop-in paths that cli-truncate's
 * and widest-line's own suites grade in `compat-oracle` (`graded-override-targets` R5, R6).
 *
 * Those suites run in another process, so these cases hold the same façades here, differentially:
 * each input goes through the incumbent the workspace installs (cli-truncate 6.1.1, widest-line
 * 6.0.0, the graded releases) and through ours, and the two must agree byte for byte. The table
 * reaches every branch — each position with and without `space` and `preferTruncationOnSpace`,
 * a styled text and a styled mark, a cut that ends on a bare `m` and one that opens on a
 * sequence that is not SGR, the one-column and zero-column budgets, and every refusal.
 */
import cliTruncateIncumbent from 'cli-truncate';
import { describe, expect, it } from 'vitest';
import widestLineIncumbent from 'widest-line';

import cliTruncate, { type Options } from './cli-truncate.js';
import widestLine from './widest-line.js';

const RED = '\u001B[31m';
const RESET = '\u001B[39m';
const BOLD = '\u001B[1m';

const texts = ['unicorn', 'unicorns rainbow dragons', `${RED}unicorn${RESET}`, `${BOLD}${RED}unicorns rainbow${RESET}\u001B[22m`, '안녕하세요', 'a🈀b🈀c', `\u001B[3xunicorn`, `unicorn\u001B[3`, 'dream mm summer mm', `unicorns \u001B[2Krainbow`];
const positions = ['start', 'middle', 'end'] as const;
const shapes: Options[] = [{}, { space: true }, { preferTruncationOnSpace: true }, { truncationCharacter: '...' }, { truncationCharacter: `${RED}~${RESET}` }, { space: true, truncationCharacter: '+' }];
const budgets = [-1, 0, 1, 2, 3, 4, 5, 8, 12, 20, 40];

const cases = texts.flatMap((text) => positions.flatMap((position) => shapes.flatMap((shape) => budgets.map((columns) => [text, columns, { ...shape, position }] as const))));

describe('linegauge/cli-truncate agrees with cli-truncate 6.1.1', () => {
  it('finds cases to compare, so the agreement cannot be vacuous', () => {
    expect(cases.length).toBeGreaterThan(1000);
  });

  it('returns what the incumbent returns, for every text, position, option and budget', () => {
    const differ = cases.filter(([text, columns, options]) => cliTruncate(text, columns, options) !== cliTruncateIncumbent(text, columns, options));
    expect(differ).toEqual([]);
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
