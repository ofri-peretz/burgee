/**
 * What cli-table3's own suite does not reach.
 *
 * `flagstaff/cli-table3` is graded **33 / 33** by cli-table3's gated cases, and that is the
 * gate. This file exists because four mutations of the port left it **green**:
 *
 *   - column widths never negotiated for a spanning cell;
 *   - holes in a ragged table never filled;
 *   - SGR state not carried across wrapped lines;
 *   - `vAlign: 'bottom'` ignored.
 *
 * All four *are* covered upstream — by the 221 cases that `require('../src/…')`, which C4
 * keeps off the gate because passing them would mean copying cli-table3's file layout. So
 * the behaviour is real, the coverage is not ours to inherit, and it is asserted here
 * instead. Every expectation was captured from **real cli-table3 0.6.5**, so these remain
 * its answers rather than mine.
 */
import { describe, expect, it } from 'vitest';

import Table from './cli-table3.js';

const ESC = '\u001B';

const render = (options: ConstructorParameters<typeof Table>[0], rows: unknown[]): string => {
  const table = new Table(options);
  table.push(...rows);
  return table.toString();
};

describe('a spanning cell widens the columns beneath it', () => {
  it('shares the difference between the columns the caller did not fix', () => {
    expect(render({}, [[{ colSpan: 2, content: 'a very wide header' }], ['x', 'y']])).toBe(
      ['┌────────────────────┐', '│ a very wide header │', '├──────────┬─────────┤', '│ x        │ y       │', '└──────────┴─────────┘'].join('\n'),
    );
  });

  it('leaves a fixed width alone, and takes the difference from the rest', () => {
    const out = render({ colWidths: [5, null] }, [[{ colSpan: 2, content: 'a very wide header' }], ['x', 'y']]);
    expect(out.split('\n')[3]).toContain('│ x   │');
  });
});

describe('a ragged table gets its holes filled', () => {
  it('a row shorter than the table gets the missing cell drawn, not left ragged', () => {
    expect(render({}, [['a', 'b'], ['c']])).toBe(['┌───┬───┐', '│ a │ b │', '├───┼───┤', '│ c │   │', '└───┴───┘'].join('\n'));
  });

  it('records the hole it filled when debugging is on', () => {
    Table.reset();
    const table = new Table({ debug: true } as never);
    table.push([{ rowSpan: 2 }], [{}]);
    table.toString();
    expect(table.messages).toEqual(['Missing cell at 0-1.']);
    Table.reset();
  });
});

describe('vertical alignment', () => {
  it('bottom sinks the line and center splits the padding', () => {
    expect(render({ rowHeights: [3] }, [[{ content: 'x', vAlign: 'bottom' }, { content: 'y', vAlign: 'center' }]])).toBe(
      ['┌───┬───┐', '│   │   │', '│   │ y │', '│ x │   │', '└───┴───┘'].join('\n'),
    );
  });
});

describe('SGR state survives a wrap', () => {
  /**
   * A style opened before the break has to be closed at the end of the first row and
   * re-opened at the start of the next, or the border between them is painted too.
   */
  it('closes at the end of each row and re-opens on the next', () => {
    const out = render({ colWidths: [14], wordWrap: true }, [[`${ESC}[1mbold text that wraps${ESC}[22m`]]);
    expect(out).toBe(['┌──────────────┐', `│ ${ESC}[1mbold text${ESC}[22m    │`, `│ ${ESC}[1mthat wraps${ESC}[22m   │`, '└──────────────┘'].join('\n'));
  });
});

describe('the shape the incumbent promises', () => {
  it('is an Array, because callers push rows onto it', () => {
    const table = new Table();
    table.push(['a'], ['b']);
    expect(table).toHaveLength(2);
    expect(Array.isArray(table)).toBe(true);
  });

  /**
   * `Object.keys`, not a spread: spreading an Array subclass walks its iterator and would
   * never see a named property, so it cannot tell the two apart. Upstream makes `options`
   * enumerable *only* when debugging, and `Object.keys` is where that shows.
   */
  it('does not leak `options` as an own key when debugging is off, and does when it is on', () => {
    const quiet = new Table({ head: ['h'] });
    quiet.push(['a']);
    expect(Object.keys(quiet)).toEqual(['0']);
    expect(quiet.messages).toBeUndefined();

    Table.reset();
    const loud = new Table({ debug: true } as never);
    loud.push(['a']);
    expect(Object.keys(loud)).toEqual(['0', 'options']);
    Table.reset();
  });

  it('reports its own drawn width', () => {
    const table = new Table({ colWidths: [10] });
    table.push(['x']);
    expect(table.width).toBe(12);
  });
});
