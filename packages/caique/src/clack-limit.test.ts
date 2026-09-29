/**
 * `limitOptions` on its own: the window a list draws when it is taller than the screen.
 *
 * `clack.test.ts` reaches it only through lists short enough to fit, so the part that
 * decides what to give up — `fitToScreen`, counted in lines rather than options — ran in
 * none of its cases. Each case here is one path through that decision, with the screen made
 * just small enough to force it. Every expected window was checked against
 * `@clack/prompts` 1.8.0's `limitOptions` on the same input before it was written down.
 * Colour is off in this suite, so the ellipsis is plain `...`.
 */
import { PassThrough } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { type SizedOutput } from './clack-core.js';
import { limitOptions } from './clack-limit.js';

/** An option draws as its own text; one with newlines in it takes that many lines. */
const plain = (option: string): string => option;

/** An option drawn with a mark for the active one. */
const marked = (option: string, active: boolean): string => `${active ? '>' : ' '}${option}`;

/** A writable that reports the size it is given, and nothing it is not. */
const screen = (size: SizedOutput = {}): PassThrough & SizedOutput => Object.assign(new PassThrough(), size);

/** The window over `options` on a screen of `rows` rows, with no rows reserved for anything else. */
const windowOf = (options: string[], cursor: number, rows: number): string[] => limitOptions({ options, cursor, style: plain, output: screen({ columns: 80, rows }), rowPadding: 0 });

const TEN = Array.from({ length: 10 }, (_unused, i) => String(i));

describe('where the window sits', () => {
  it('stays at the top until the cursor comes within three of the bottom', () => {
    expect(windowOf(TEN, 1, 5)).toEqual(['0', '1', '2', '3', '...']);
  });

  it('slides with the cursor, with an ellipsis at each end that was cut', () => {
    expect(windowOf(TEN, 6, 5)).toEqual(['...', '5', '6', '7', '...']);
  });

  it('stops at the end of the list rather than running past it', () => {
    expect(windowOf(TEN, 9, 5)).toEqual(['...', '6', '7', '8', '9']);
  });

  it('marks the active option, and only that one', () => {
    expect(limitOptions({ options: ['a', 'b', 'c'], cursor: 1, style: marked, output: screen({ columns: 80, rows: 10 }), rowPadding: 0 })).toEqual([' a', '>b', ' c']);
  });

  it('draws a hole in a sparse list as an empty line, without asking the style about it', () => {
    const seen: string[] = [];
    const style = (option: string): string => {
      seen.push(option);
      return option;
    };
    // The hole is the case: `TOption[]` does not promise every index is filled.
    const options = ['a', , 'c'] as string[];
    expect(limitOptions({ options, cursor: 0, style, output: screen({ columns: 80, rows: 10 }), rowPadding: 0 })).toEqual(['a', '', 'c']);
    expect(seen).toEqual(['a', 'c']);
  });
});

describe('the screen it measures', () => {
  it('assumes 80 columns and 20 rows of an output that does not say', () => {
    const long = 'x'.repeat(100);
    const drawn = limitOptions({ options: [long, ...TEN, ...TEN], cursor: 0, style: plain, output: screen() });
    // 80 columns wrap the first option onto two lines; 20 rows less the default padding of 4 leave 16.
    expect(drawn.slice(0, 2)).toEqual(['x'.repeat(80), 'x'.repeat(20)]);
    expect(drawn).toHaveLength(16);
    expect(drawn.at(-1)).toBe('...');
  });

  it('reads process.stdout when no output is given', () => {
    const stdout = process.stdout as { columns?: number; rows?: number };
    const had = { columns: Object.getOwnPropertyDescriptor(stdout, 'columns'), rows: Object.getOwnPropertyDescriptor(stdout, 'rows') };
    Object.defineProperty(stdout, 'columns', { configurable: true, value: 3 });
    Object.defineProperty(stdout, 'rows', { configurable: true, value: 10 });
    try {
      // 10 rows less 4 of padding is 6: five options and the ellipsis, each wrapped at 3 columns.
      expect(limitOptions({ options: ['abcd', ...TEN], cursor: 0, style: plain })).toEqual(['abc', 'd', '0', '1', '2', '...']);
    } finally {
      for (const [key, descriptor] of Object.entries(had)) {
        if (descriptor === undefined) delete (stdout as Record<string, unknown>)[key];
        else Object.defineProperty(stdout, key, descriptor);
      }
    }
  });

  it('opens a window of five options however few maxItems asks for', () => {
    expect(limitOptions({ options: TEN, cursor: 0, style: plain, output: screen({ columns: 80, rows: 20 }), maxItems: 2 })).toEqual(['0', '1', '2', '3', '...']);
  });

  it('opens a window of maxItems when the screen has room for more', () => {
    expect(limitOptions({ options: TEN, cursor: 0, style: plain, output: screen({ columns: 80, rows: 20 }), maxItems: 7 })).toEqual(['0', '1', '2', '3', '4', '5', '...']);
  });

  it('takes columnPadding off the width before wrapping', () => {
    expect(limitOptions({ options: ['abcdef'], cursor: 0, style: plain, output: screen({ columns: 6, rows: 10 }), columnPadding: 2, rowPadding: 0 })).toEqual(['abcd', 'ef']);
  });
});

/**
 * When the options wrapped, whole options are dropped until the lines fit, away from the
 * cursor — below it first when the window is at the top, above it first once it has slid.
 */
describe('when the options wrapped past the screen', () => {
  it('drops options below the cursor, and pays for the ellipsis that takes their place', () => {
    expect(windowOf(['a', 'b', 'c\nc\nc'], 0, 4)).toEqual(['a', 'b', '...']);
  });

  it('drops only as many below as it has to, when there is already an ellipsis there', () => {
    expect(windowOf(['0', '1\n1\n1', ...TEN.slice(2)], 0, 5)).toEqual(['0', '1', '1', '1', '...']);
  });

  it('leaves the options above the cursor alone when dropping below was enough', () => {
    expect(windowOf(['a', 'b', 'c', 'd\nd\nd'], 1, 5)).toEqual(['a', 'b', 'c', '...']);
  });

  it('turns to the options above the cursor when dropping below was not enough', () => {
    expect(windowOf(['a\na', 'b\nb', 'c'], 2, 4)).toEqual(['...', 'c']);
  });

  it('drops above the cursor first once the window has slid', () => {
    const options = [...TEN.slice(0, 5), '5\n5', ...TEN.slice(6)];
    expect(windowOf(options, 6, 5)).toEqual(['...', '6', '7', '...']);
  });

  it('then below it, inside the ellipsis already there', () => {
    const options = [...TEN.slice(0, 5), '5\n5', '6', '7\n7\n7', ...TEN.slice(8)];
    expect(windowOf(options, 6, 5)).toEqual(['...', '6', '...']);
  });

  it('then below it, paying for a new ellipsis at the bottom', () => {
    const options = [...TEN.slice(0, 8), '8\n8\n8', '9\n9'];
    expect(windowOf(options, 8, 5)).toEqual(['...', '8', '8', '8', '...']);
  });

  it('counts that new ellipsis before it counts the options, so the window never overflows the screen', () => {
    // Dropping `9` alone would fit five lines only if the ellipsis that replaces it were free.
    const options = [...TEN.slice(0, 7), '7\n7\n7', '8', '9'];
    expect(windowOf(options, 7, 5)).toEqual(['...', '7', '7', '7', '...']);
  });

  it('keeps an active option that alone is taller than the screen', () => {
    expect(windowOf(['a', 'b\nb\nb\nb\nb\nb', 'c'], 1, 4)).toEqual(['...', 'b', 'b', 'b', 'b', 'b', 'b', '...']);
  });

  it('leaves only the ellipsis for a cursor past the end on a screen with no rows, as clack does, rather than throwing', () => {
    expect(limitOptions({ options: TEN, cursor: 20, style: plain, output: screen({ columns: 80, rows: 0 }) })).toEqual(['...']);
  });
});
