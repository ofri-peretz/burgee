import { width } from 'linegauge';
import { wrap } from 'linegauge/wrap';
/**
 * A table (R7) — cli-table3's job, as a string function, and again with no layout engine.
 *
 * Column widths are the maximum measured width in each column, capped so the whole table
 * fits; nothing is laid out, negotiated or re-flowed. A cell too wide for its column wraps
 * inside it, which is the one place `wrap()` earns its keep here.
 *
 * The static projection is **not** the drawn table. A grid of box characters is unreadable
 * off a terminal and worse than useless to a screen reader, so `static()` emits one line
 * per row as `header: value` pairs — which is also what an agent can parse without knowing
 * anything about the drawing.
 *
 * **A cell may carry a destination** (R12): `{ text, href }` renders as a terminal hyperlink
 * where the terminal is believed to do OSC 8 and as `text (url)` everywhere else. Neither
 * decision nor sequence is this file's — both come from `paratext/link` through `./link.js`,
 * which is the only module here that knows OSC 8 exists.
 */
import { heading, muted } from 'roundel/tokens';

import { type Cell, cellHref, cellText, laid, type Painter, painted, painter, STATIC, type Terminal } from './link.js';
import { type Component } from './plugin.js';

/** A row of cells. A plain `string[]` is still a row — a destination is opt-in per cell. */
export type Row = Cell[];

export interface TableOptions {
  /** Column headers. Omitted, the table is drawn without a header row. */
  head?: string[];
  /** Columns the whole table may occupy. Default 80. */
  width?: number;
  /** Alignment per column; `left` for any column not named. */
  align?: ('left' | 'right')[];
  /**
   * Bounds per column, positional like `align`; a hole or a missing entry is unbounded. Both
   * are content widths, as `width()` measures them, padding not counted.
   */
  columns?: (ColumnOptions | undefined)[];
  /**
   * The terminal a linked cell is rendered for. Omitted, the real process is read through
   * this package's seam. Supply one and the whole path is pure — which is how `link.test.ts`
   * grades both branches without a terminal in sight.
   */
  terminal?: Terminal;
}

/** One column's bounds (`table-column-widths` R1). */
export interface ColumnOptions {
  /**
   * How far the fit may narrow the column while another can still give way. A whole number
   * from 0. It bounds the shrink and is not a width: a column narrower than it stays so.
   */
  min?: number;
  /** A cap no content pushes the column past. A whole number from 1, and at least `min`. */
  max?: number;
}

const DEFAULT_WIDTH = 80;
/**
 * What the drawing costs beyond the columns themselves. A rule is `┌` + one run of `─` per
 * column, each two wider than the column (its padding), joined by `┬` and closed by `┐`:
 * `2 + Σ(w + 2) + (n - 1)` = `Σw + 3n + 1`. So the columns get `total - 3n - 1`.
 */
const CHROME_PER_COLUMN = 3;
/** No column is narrowed below this unless its own `min` says it may be. */
const MIN_COLUMN = 3;

const V = '│';

/** A cell's text as the drawing measures it, by `laid`'s rule for the runtime `paint` is bound to. */
const lay = (cell: Cell | undefined, paint: Painter): string => laid(cellText(cell), cellHref(cell), paint);

/**
 * Shrink the widest column, one cell at a time, until the table fits. Simple on purpose —
 * proportional shrinking looks cleverer and reads worse, because it narrows the columns
 * that were already narrow.
 *
 * Only a column still above its floor gives way: its own `min`, else `MIN_COLUMN`. Ties go to
 * the leftmost column. With no `min` the loop cannot run out of columns, because `table()`
 * never offers less than `MIN_COLUMN` per column. So it stopping short means the mins add up
 * past the width, and then they win and the table is wider than asked: a bound the author
 * set is not broken to meet a default width, the choice `MIN_COLUMN` already makes.
 *
 * Narrows `widths` in place and returns it: the caller hands over an array nothing else reads.
 */
function fitWidths(widths: number[], available: number, { columns: bounds = [] }: TableOptions): number[] {
  for (let total = widths.reduce((sum, w) => sum + w, 0); total > available; total--) {
    const pick = widths.reduce((best, w, i) => (w > (bounds[i]?.min ?? MIN_COLUMN) && (best < 0 || w > (widths[best] as number)) ? i : best), -1);
    if (pick < 0) break;
    widths.splice(pick, 1, (widths[pick] as number) - 1);
  }
  return widths;
}

/**
 * One logical row as the physical rows it occupies once its cells have wrapped.
 *
 * The destination goes on **after** wrapping, around whatever text survived — the lesson
 * cli-table3 learned the hard way in its issue #338, where a link applied first was cut
 * through the middle of its own url and left a sequence that never closed.
 */
function layoutRow(row: Row, widths: number[], options: TableOptions, paint: Painter): string[] {
  const cells = widths.map((w, i) => wrap(lay(row[i], paint), w, { hard: true, trim: false }).split('\n'));
  // Pad to the column, then hand the text its destination. The gap is measured from the plain
  // line, before any sequence is added — `width()` strips OSC 8, so the two orders agree, and
  // measuring first means the alignment cannot depend on that staying true.
  const pad = (plain: string, room: number, i: number): string => {
    const gap = ' '.repeat(Math.max(0, room - width(plain)));
    const line = painted(plain, cellHref(row[i]), paint);
    return options.align?.[i] === 'right' ? gap + line : line + gap;
  };
  return Array.from({ length: Math.max(1, ...cells.map((lines) => lines.length)) }, (_, line) => `${V} ${widths.map((w, i) => pad(cells[i]?.[line] ?? '', w, i)).join(` ${V} `)} ${V}`);
}

/** A horizontal rule; its three joints are the left end, the one between columns and the right end. */
const rule = (widths: number[], [left, mid, right]: string): string => `${left}${widths.map((w) => '─'.repeat(w + 2)).join(mid)}${right}`;

/** Draw `rows` as a table, as a string. */
export function table(rows: Row[], options: TableOptions = {}): string {
  const columns = Math.max(options.head?.length ?? 0, ...rows.map((row) => row.length), 1);
  // A negative, fractional, infinite or NaN width is a typo and `min > max` two wishes that
  // contradict, so both are refused, naming the column, before anything is measured. `x % 1`
  // is 0 for a whole number only: a fraction leaves a remainder, and NaN or Infinity gives
  // NaN, so the sum of the two is 0 exactly when both are whole (a negative fraction that
  // could cancel a positive one is refused by `min < 0` or `max < 1` anyway).
  options.columns?.forEach((column, i) => {
    const { min = 0, max = min || 1 } = column ?? {};
    if ((min % 1) + (max % 1) !== 0 || min < 0 || max < Math.max(min, 1)) throw new TypeError(`flagstaff/table: columns[${i}] needs whole widths, 0 <= min <= max, max >= 1`);
  });
  const available = Math.max(columns * MIN_COLUMN, (options.width ?? DEFAULT_WIDTH) - columns * CHROME_PER_COLUMN - 1);

  const paint = painter(options.terminal);

  const all = options.head === undefined ? rows : [options.head, ...rows];
  // The natural width of each column: the widest cell in it, header included, held to its `max`.
  // `fitWidths` narrows that array in place, so it is never bound to a name of its own.
  const widths = fitWidths(
    Array.from({ length: columns }, (_, i) => Math.min(options.columns?.[i]?.max ?? Infinity, Math.max(0, ...all.map((row) => width(lay(row[i], paint)))))),
    available,
    options,
  );

  const out = [rule(widths, '┌┬┐')];
  if (options.head !== undefined) {
    out.push(...layoutRow(options.head.map((cell) => heading(cell)), widths, options, paint), rule(widths, '├┼┤'));
  }
  for (const row of rows) out.push(...layoutRow(row, widths, options, paint));
  out.push(rule(widths, '└┴┘'));
  return out.join('\n');
}

export interface TableState {
  head?: string[];
  rows: Row[];
}

/** A table as a component: `header: value` pairs off a terminal, the grid on one (R1). */
export function tableComponent(options: TableOptions = {}): Component<TableState> {
  // A static projection is by definition the rendering with no terminal under it, so a
  // linked cell reads `src/index.ts (file:///…)` here — the destination survives into the
  // log an agent parses instead of being dropped with the escape (R12, PRINCIPLES rule 5).
  const plain = painter(STATIC);
  return {
    name: 'table',
    // A drawn grid is unreadable in a log and to a screen reader. Pairs are not.
    static: (state) => {
      const head = state.head ?? options.head;
      return state.rows
        .map((row) => row.map((cell, i) => (head === undefined ? '' : `${head[i] ?? i}: `) + lay(cell, plain)).join(head === undefined ? '\t' : ', '))
        .join('\n');
    },
    frame: (_t, state) => muted(table(state.rows, state.head === undefined ? options : { ...options, head: state.head })),
  };
}

/** The cell shapes, re-exported so a caller of `flagstaff/table` can name them (R12). */
export type { Cell, Linked } from './link.js';
