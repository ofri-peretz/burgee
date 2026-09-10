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
 */
import { heading, muted } from 'roundel/tokens';

import { type Component } from './plugin.js';

export type Row = string[];

export interface TableOptions {
  /** Column headers. Omitted, the table is drawn without a header row. */
  head?: string[];
  /** Columns the whole table may occupy. Default 80. */
  width?: number;
  /** Alignment per column; `left` for any column not named. */
  align?: ('left' | 'right')[];
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

const padTo = (line: string, cells: number, align: 'left' | 'right'): string => {
  const gap = ' '.repeat(Math.max(0, cells - width(line)));
  return align === 'right' ? gap + line : line + gap;
};

/** The natural width of each column: the widest cell in it, header included. */
function naturalWidths(rows: Row[], columns: number): number[] {
  const widths = Array.from({ length: columns }, () => 0);
  for (const row of rows) {
    for (let index = 0; index < columns; index += 1) widths[index] = Math.max(widths[index] ?? 0, width(row[index] ?? ''));
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

/** One logical row as the physical rows it occupies once its cells have wrapped. */
function layoutRow(row: Row, widths: number[], align: ('left' | 'right')[]): string[] {
  const cells = widths.map((w, index) => wrap(row[index] ?? '', w, { hard: true, trim: false }).split('\n'));
  const height = Math.max(1, ...cells.map((lines) => lines.length));
  return Array.from({ length: height }, (_, line) =>
    `${V} ${widths.map((w, index) => padTo(cells[index]?.[line] ?? '', w, align[index] ?? 'left')).join(` ${V} `)} ${V}`,
  );
}

const rule = (widths: number[], left: string, mid: string, right: string): string => left + widths.map((w) => H.repeat(w + 2)).join(mid) + right;

/** Draw `rows` as a table, as a string. */
export function table(rows: Row[], options: TableOptions = {}): string {
  const columns = Math.max(options.head?.length ?? 0, ...rows.map((row) => row.length), 1);
  const total = options.width ?? DEFAULT_WIDTH;
  const align = options.align ?? [];
  const available = Math.max(columns * MIN_COLUMN, total - columns * CHROME_PER_COLUMN - CHROME_FIXED);

  const all = options.head === undefined ? rows : [options.head, ...rows];
  const widths = fitWidths(naturalWidths(all, columns), available);

  const out = [rule(widths, CORNERS.topLeft, CORNERS.top, CORNERS.topRight)];
  if (options.head !== undefined) {
    out.push(...layoutRow(options.head.map((cell) => heading(cell)), widths, align), rule(widths, CORNERS.left, CORNERS.cross, CORNERS.right));
  }
  for (const row of rows) out.push(...layoutRow(row, widths, align));
  out.push(rule(widths, CORNERS.bottomLeft, CORNERS.bottom, CORNERS.bottomRight));
  return out.join('\n');
}

export interface TableState {
  head?: string[];
  rows: Row[];
}

/** A table as a component: `header: value` pairs off a terminal, the grid on one (R1). */
export function tableComponent(options: TableOptions = {}): Component<TableState> {
  return {
    name: 'table',
    // A drawn grid is unreadable in a log and to a screen reader. Pairs are not.
    static: (state) => {
      const head = state.head ?? options.head;
      return state.rows.map((row) => (head === undefined ? row.join('\t') : row.map((cell, index) => `${head[index] ?? index}: ${cell}`).join(', '))).join('\n');
    },
    frame: (_t, state) => muted(table(state.rows, state.head === undefined ? options : { ...options, head: state.head })),
  };
}
