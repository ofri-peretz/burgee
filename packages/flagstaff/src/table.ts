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
   * The terminal a linked cell is rendered for. Omitted, the real process is read through
   * this package's seam. Supply one and the whole path is pure — which is how `link.test.ts`
   * grades both branches without a terminal in sight.
   */
  terminal?: Terminal;
}

const DEFAULT_WIDTH = 80;
/**
 * What the drawing costs beyond the columns themselves. A rule is `┌` + one run of `─` per
 * column, each two wider than the column (its padding), joined by `┬` and closed by `┐`:
 * `2 + Σ(w + 2) + (n - 1)` = `Σw + 3n + 1`. So the columns get `total - 3n - 1`.
 */
const CHROME_PER_COLUMN = 3;
const CHROME_FIXED = 1;
const MIN_COLUMN = 3;

const V = '│';
const H = '─';
const CORNERS = { topLeft: '┌', topRight: '┐', bottomLeft: '└', bottomRight: '┘', top: '┬', bottom: '┴', left: '├', right: '┤', cross: '┼' };

/**
 * Pad to the column, then hand the text its destination. The gap is measured from the plain
 * line, before any sequence is added — `width()` strips OSC 8, so the two orders agree, and
 * measuring first means the alignment cannot depend on that staying true.
 */
const padTo = (line: string, cells: number, align: 'left' | 'right', measured = line): string => {
  const gap = ' '.repeat(Math.max(0, cells - width(measured)));
  return align === 'right' ? gap + line : line + gap;
};

/** The natural width of each column: the widest cell in it, header included. */
function naturalWidths(rows: Row[], columns: number, paint: Painter): number[] {
  const widths = Array.from({ length: columns }, () => 0);
  for (const row of rows) {
    for (let index = 0; index < columns; index += 1) widths[index] = Math.max(widths[index] ?? 0, width(laid(cellText(row[index]), cellHref(row[index]), paint)));
  }
  return widths;
}

/**
 * Shrink the widest column, one cell at a time, until the table fits. Simple on purpose —
 * proportional shrinking looks cleverer and reads worse, because it narrows the columns
 * that were already narrow.
 */
function fitWidths(natural: number[], available: number): number[] {
  const widths = [...natural];
  let total = widths.reduce((sum, w) => sum + w, 0);
  while (total > available) {
    let widest = 0;
    for (let index = 1; index < widths.length; index += 1) if ((widths[index] ?? 0) > (widths[widest] ?? 0)) widest = index;
    if ((widths[widest] ?? 0) <= MIN_COLUMN) break;
    widths[widest] = (widths[widest] ?? 0) - 1;
    total -= 1;
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
function layoutRow(row: Row, widths: number[], align: ('left' | 'right')[], paint: Painter): string[] {
  const cells = widths.map((w, index) => wrap(laid(cellText(row[index]), cellHref(row[index]), paint), w, { hard: true, trim: false }).split('\n'));
  const height = Math.max(1, ...cells.map((lines) => lines.length));
  return Array.from({ length: height }, (_, line) =>
    `${V} ${widths
      .map((w, index) => {
        const plain = cells[index]?.[line] ?? '';
        return padTo(painted(plain, cellHref(row[index]), paint), w, align[index] ?? 'left', plain);
      })
      .join(` ${V} `)} ${V}`,
  );
}

const rule = (widths: number[], left: string, mid: string, right: string): string => left + widths.map((w) => H.repeat(w + 2)).join(mid) + right;

/** Draw `rows` as a table, as a string. */
export function table(rows: Row[], options: TableOptions = {}): string {
  const columns = Math.max(options.head?.length ?? 0, ...rows.map((row) => row.length), 1);
  const total = options.width ?? DEFAULT_WIDTH;
  const align = options.align ?? [];
  const available = Math.max(columns * MIN_COLUMN, total - columns * CHROME_PER_COLUMN - CHROME_FIXED);

  const paint = painter(options.terminal);

  const all = options.head === undefined ? rows : [options.head, ...rows];
  const widths = fitWidths(naturalWidths(all, columns, paint), available);

  const out = [rule(widths, CORNERS.topLeft, CORNERS.top, CORNERS.topRight)];
  if (options.head !== undefined) {
    out.push(...layoutRow(options.head.map((cell) => heading(cell)), widths, align, paint), rule(widths, CORNERS.left, CORNERS.cross, CORNERS.right));
  }
  for (const row of rows) out.push(...layoutRow(row, widths, align, paint));
  out.push(rule(widths, CORNERS.bottomLeft, CORNERS.bottom, CORNERS.bottomRight));
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
      const show = (cell: Cell | undefined): string => laid(cellText(cell), cellHref(cell), plain);
      return state.rows
        .map((row) => (head === undefined ? row.map((cell) => show(cell)).join('\t') : row.map((cell, index) => `${head[index] ?? index}: ${show(cell)}`).join(', ')))
        .join('\n');
    },
    frame: (_t, state) => muted(table(state.rows, state.head === undefined ? options : { ...options, head: state.head })),
  };
}

/** The cell shapes, re-exported so a caller of `flagstaff/table` can name them (R12). */
export type { Cell, Linked } from './link.js';
