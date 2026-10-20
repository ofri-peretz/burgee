/**
 * `table-column-widths` — a column can be capped, held open, and told what to do past its cap.
 *
 * The general table behaviour (every row the same width, wrapping, alignment, the static
 * pairs) is graded in `builtins.test.ts` and is untouched by `columns`: no `columns` is
 * today's layout exactly. This file grades the option itself, one block per requirement of
 * `.sdlc/intents/table-column-widths/spec.md`.
 */
import { width } from 'linegauge';
import { linkFor } from 'paratext/link';
import { describe, expect, it } from 'vitest';

import { STATIC, type Terminal } from './link.js';
import { table, tableComponent } from './table.js';

/** The content width of each column, read off the top rule: every run of `─` is the column plus its two cells of padding. */
const columnWidths = (drawing: string): number[] => (drawing.split('\n')[0] ?? '').slice(1, -1).split('┬').map((run) => width(run) - 2);

const URL = `https://example.com/${'a'.repeat(40)}`;

describe('R1 · the `columns` option', () => {
  it.each([
    [{ min: 5, max: 3 }, /columns\[0\]/],
    [{ min: -1 }, /columns\[0\]/],
    [{ max: 2.5 }, /columns\[0\]/],
    [{ max: 0 }, /columns\[0\]/],
    [{ min: Number.NaN }, /columns\[0\]/],
    [{ max: Number.NaN }, /columns\[0\]/],
    [{ min: Number.POSITIVE_INFINITY }, /columns\[0\]/],
    [{ max: Number.POSITIVE_INFINITY }, /columns\[0\]/],
    [{ min: -0.5, max: 1.5 }, /columns\[0\]/],
  ])('rejects %o with a TypeError naming the column', (bounds, named) => {
    expect(() => table([['a']], { columns: [bounds] })).toThrow(TypeError);
    expect(() => table([['a']], { columns: [bounds] })).toThrow(named);
  });

  it('names the column it is about, positionally, past a hole', () => {
    expect(() => table([['a', 'b']], { columns: [undefined, { min: 4, max: 2 }] })).toThrow(/columns\[1\]/);
  });

  it('a column with no bounds, or none at all, draws as it always did', () => {
    const rows = [['ora', 'a much longer cell than the header'], ['log-update', '99']];
    const before = table(rows, { head: ['host', 'note'], width: 30 });
    expect(table(rows, { head: ['host', 'note'], width: 30, columns: [] })).toBe(before);
    expect(table(rows, { head: ['host', 'note'], width: 30, columns: [{}, undefined] })).toBe(before);
  });
});

describe('R2 · bounds in the fit', () => {
  it('a 60-cell URL column with `max: 12` is 12 wide, with room to spare', () => {
    expect(width(URL)).toBe(60);
    const drawn = table([[URL, 'ok']], { columns: [{ max: 12 }], width: 80, terminal: STATIC });
    expect(columnWidths(drawn)).toEqual([12, 2]);
  });

  it('a `min: 10` column keeps 10 while the URL column shrinks', () => {
    // 22 columns leave 15 for content. Without `min`, the fit takes them to 7 and 8.
    const rows = [[URL, 'x'.repeat(12)]];
    expect(columnWidths(table(rows, { width: 22, terminal: STATIC }))).toEqual([7, 8]);
    const drawn = table(rows, { columns: [undefined, { min: 10 }], width: 22, terminal: STATIC });
    expect(columnWidths(drawn)).toEqual([5, 10]);
    for (const line of drawn.split('\n')) expect(width(line)).toBe(22);
  });

  it('a `min` above the content is not padded up to: it bounds the shrink, it is not a width', () => {
    expect(columnWidths(table([['ab', 'cd']], { columns: [{ min: 10 }], width: 80 }))).toEqual([2, 2]);
  });

  it('when the mins add up past `width`, the mins win and the table is wider than asked', () => {
    const rows = [['a'.repeat(20), 'b'.repeat(20)]];
    const drawn = table(rows, { columns: [{ min: 12 }, { min: 12 }], width: 20, terminal: STATIC });
    expect(columnWidths(drawn)).toEqual([12, 12]);
    expect(width(drawn.split('\n')[0] ?? '')).toBe(12 + 12 + 7);
  });

  it('a `min` under the default floor lets that column give way further', () => {
    // 14 columns leave 7 for content; the second column holds 10, so the first gives what it can.
    const rows = [['a'.repeat(10), 'b'.repeat(10)]];
    expect(columnWidths(table(rows, { columns: [undefined, { min: 10 }], width: 14, terminal: STATIC }))).toEqual([3, 10]);
    expect(columnWidths(table(rows, { columns: [{ min: 1 }, { min: 10 }], width: 14, terminal: STATIC }))).toEqual([1, 10]);
  });

  it('`max` is the content width, padding not counted, and holds for the header too', () => {
    const drawn = table([['abcdefgh']], { head: ['a long header'], columns: [{ max: 4 }], width: 80 });
    expect(columnWidths(drawn)).toEqual([4]);
  });
});

/** A terminal paratext believes does OSC 8, as `link.test.ts` names it. */
const TTY: Terminal = { env: { TERM_PROGRAM: 'iTerm.app' }, isTTY: { stdout: true } };

/** The body rows of a drawing with no header: everything between the top and bottom rules. */
const body = (drawing: string): string[] => drawing.split('\n').slice(1, -1);

describe('R3 · `truncate` overflow', () => {
  it('a truncated cell ends in `…`, is one physical row, and fills its column exactly', () => {
    const drawn = table([[URL, 'ok']], { columns: [{ max: 12, overflow: 'truncate' }], terminal: STATIC });
    expect(body(drawn)).toEqual([`│ ${URL.slice(0, 11)}… │ ok │`]);
    expect(columnWidths(drawn)).toEqual([12, 2]);
  });

  it('`wrap`, named or not, is today\'s behaviour: the same cell takes as many rows as it needs', () => {
    const wrapped = table([[URL, 'ok']], { columns: [{ max: 12 }], terminal: STATIC });
    expect(body(wrapped)).toHaveLength(5);
    expect(table([[URL, 'ok']], { columns: [{ max: 12, overflow: 'wrap' }], terminal: STATIC })).toBe(wrapped);
  });

  it('a value that fits is left whole, with no `…`', () => {
    expect(body(table([['short']], { columns: [{ max: 12, overflow: 'truncate' }], terminal: STATIC }))).toEqual(['│ short │']);
  });

  it('cuts by display width, so a wide character is never split', () => {
    const drawn = table([['古池や蛙飛び込む水の音']], { columns: [{ max: 7, overflow: 'truncate' }], terminal: STATIC });
    expect(body(drawn)).toEqual(['│ 古池や… │']);
    for (const line of drawn.split('\n')) expect(width(line)).toBe(11);
  });

  it('a line break in the cell reads as a space, since the cell has one row to give it', () => {
    expect(body(table([['one\ntwo three']], { columns: [{ max: 8, overflow: 'truncate' }], terminal: STATIC }))).toEqual(['│ one two… │']);
  });

  it('when the fit narrows the column further, the cut follows the column, not `max`', () => {
    const drawn = table([[URL, 'x'.repeat(30)]], { columns: [{ max: 40, overflow: 'truncate' }], width: 40, terminal: STATIC });
    const [first] = columnWidths(drawn);
    expect(first).toBeLessThan(40);
    expect(body(drawn)[0]).toContain(`${URL.slice(0, (first as number) - 1)}… │`);
  });

  it('keeps its OSC 8 link around the surviving text, closed, on the one row', () => {
    const drawn = table([[{ text: URL, href: 'https://example.com/' }, 'ok']], { columns: [{ max: 12, overflow: 'truncate' }], terminal: TTY });
    const rows = body(drawn);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain(linkFor(TTY)(`${URL.slice(0, 11)}…`, 'https://example.com/'));
    expect(width(rows[0] ?? '')).toBe(width(drawn.split('\n')[0] ?? ''));
  });

  it('a header in a `truncate` column is cut the same way', () => {
    const drawn = table([['abc']], { head: ['a long header'], columns: [{ max: 6, overflow: 'truncate' }], terminal: STATIC });
    expect(drawn.split('\n')[1]).toBe('│ a lon… │');
  });
});

describe('R4 · the static projection is unchanged', () => {
  const component = tableComponent({ head: ['id', 'status'], columns: [{ max: 12, overflow: 'truncate' }], terminal: STATIC });

  it('the static lines hold the full value whatever `columns` says', () => {
    expect(component.static({ rows: [[URL, 'ok']] })).toBe(`id: ${URL}, status: ok`);
    expect(component.static({ head: ['url', 's'], rows: [[{ text: URL, href: 'https://example.com/' }, 'ok']] })).toBe(`url: ${URL} (https://example.com/), s: ok`);
  });

  it('while the drawn frame, from the same options, is cut', () => {
    const frame = component.frame?.(0, { rows: [[URL, 'ok']] }) ?? '';
    expect(frame).toContain(`${URL.slice(0, 11)}…`);
    expect(frame).not.toContain(URL);
  });
});
