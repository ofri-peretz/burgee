/**
 * `screen.ts` is the gallery's terminal: if it misreads a sequence the page shows a screen no
 * terminal would. Each case is one sequence the family writes, replayed onto a small grid.
 */
import { describe, expect, it } from 'vitest';

import { screenOf } from './screen.js';

const SIZE = { columns: 6, rows: 3 };
const ESC = '\u001B';

describe('screenOf', () => {
  it('prints, wraps at the margin, and turns a newline into a new line', () => {
    expect(screenOf('ab\ncdefghi', SIZE)).toEqual(['ab', 'cdefgh', 'i']);
  });

  it('scrolls when a line feed falls off the last row', () => {
    expect(screenOf('1\n2\n3\n4', SIZE)).toEqual(['2', '3', '4']);
  });

  it('returns to the first column on a carriage return, and drops a lone escape', () => {
    expect(screenOf('abc\rX\u001Bq', SIZE)).toEqual(['Xqc', '', '']);
  });

  it('moves up, down, left, right, to a column and to a position', () => {
    expect(screenOf(`abc\ndef${ESC}[1A${ESC}[1GX${ESC}[1BY${ESC}[1C${ESC}[2DZ${ESC}[3;5HW`, SIZE)).toEqual(['Xbc', 'dZf', '    W']);
  });

  it('erases to the end, from the start, and the whole of a line', () => {
    expect(screenOf(`abcdef${ESC}[1G${ESC}[3C${ESC}[K\nabcdef${ESC}[1G${ESC}[2C${ESC}[1K\nabcdef${ESC}[2K`, SIZE)).toEqual(['abc', '   def', '']);
  });

  it('erases below, above, and the whole display', () => {
    expect(screenOf(`aaa\nbbb\nccc${ESC}[2A${ESC}[2G${ESC}[J`, SIZE)).toEqual(['a', '', '']);
    expect(screenOf(`aaa\nbbb\nccc${ESC}[1A${ESC}[2G${ESC}[1J`, SIZE)).toEqual(['', '  b', 'ccc']);
    expect(screenOf(`aaa\nbbb${ESC}[2J`, SIZE)).toEqual(['', '', '']);
  });

  it('saves and restores the cursor, and ignores colour and private modes', () => {
    expect(screenOf(`${ESC}7${ESC}[2;3H${ESC}[1mx${ESC}[0m${ESC}[?25l${ESC}[?2026h${ESC}8y`, SIZE)).toEqual(['y', '  x', '']);
  });

  it('draws the alternate screen on a fresh grid and gives the main one back when it is left', () => {
    expect(screenOf(`main${ESC}[?1049hALT`, SIZE)).toEqual(['ALT', '', '']);
    expect(screenOf(`main${ESC}[?1049hALT${ESC}[?1049l!`, SIZE)).toEqual(['main!', '', '']);
    expect(screenOf(`main${ESC}[?1049l!`, SIZE)).toEqual(['main!', '', '']);
  });

  it('gives a wide character two cells, wrapping it whole, and a zero-width one none', () => {
    expect(screenOf('abcde漢́', SIZE)).toEqual(['abcde', '漢', '']);
  });
});
