/**
 * R8 — layout. Rows and columns, with fixed, fractional, minimum and fit-to-content sizes,
 * computed as integer arithmetic over `linegauge` widths. There is no flexbox and no solver:
 * one pass hands out fixed and fitted cells, a second shares what is left by fraction, and a
 * terminal too small for the minimums clips the later parts, never the earlier ones.
 *
 * Nothing here paints (R15). The result is a rectangle per pane; the compositor fills it.
 */
import { lineCount, widest } from 'linegauge';

/**
 * How much of its parent's main axis a part takes.
 *
 * - a number: exactly that many cells;
 * - `{ fr, min }`: a share of what the fixed and fitted parts leave, never below `min`;
 * - `'fit'`: as many cells as the pane's content needs along that axis — its widest line in
 *   a row, its line count in a column. Only a pane can fit; a split has no content of its own.
 */
export type Size = number | { fr: number; min?: number } | 'fit';

/** A pane by name, or a split of parts. */
export type Layout = string | Split;

export interface Split {
  /** `row` places parts left to right; `column` places them top to bottom. */
  direction: 'row' | 'column';
  parts: Part[];
}

export interface Part {
  /** Defaults to `{ fr: 1 }`. */
  size?: Size;
  content: Layout;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What a pane holds, for `'fit'`. Lines are measured with `linegauge`, so ANSI and wide characters count right. */
export type Contents = Readonly<Record<string, readonly string[]>>;

/** How many cells each part of one axis gets, given `total`. Exported for the arithmetic's own tests. */
export function distribute(total: number, sizes: readonly (number | { fr: number; min?: number })[]): number[] {
  let left = Math.max(0, Math.floor(total));
  // Pass 1: fixed cells and every minimum, in declared order. A screen too small for them
  // clips the later parts: the first pane stays readable, which is the one people look at.
  const base = sizes.map((size) => {
    const n = Math.min(left, Math.max(0, Math.floor(typeof size === 'number' ? size : (size.min ?? 0))));
    left -= n;
    return n;
  });
  // Pass 2: share the rest by fraction, on top of each minimum. A part whose share is
  // already covered by its minimum takes nothing more, and drops out of the pool.
  const fr = (i: number): number => (sizes[i] as { fr: number }).fr;
  let pool = sizes.flatMap((size, i) => (typeof size === 'number' || size.fr <= 0 ? [] : [i]));
  let frs = 0;
  let room = 0;
  for (let changed = true; changed; ) {
    frs = pool.reduce((sum, i) => sum + fr(i), 0);
    room = left + pool.reduce((sum, i) => sum + base[i]!, 0);
    const before = pool.length;
    pool = pool.filter((i) => base[i]! < (room * fr(i)) / frs);
    changed = pool.length !== before;
  }
  const shares = base.map((n, i) => (pool.includes(i) ? Math.floor((room * fr(i)) / frs) : n));
  // Rounding leftovers go one cell each to the earliest fractional parts, so a frame is
  // always filled and the same input always lays out the same way. Each floor loses under
  // one cell, so there are fewer leftovers than parts.
  const rest = room - pool.reduce((sum, i) => sum + shares[i]!, 0);
  return shares.map((n, i) => n + (pool.includes(i) && pool.indexOf(i) < rest ? 1 : 0));
}

/** The size a part asks for along an axis, with `'fit'` resolved against its content. */
function resolve(part: Part, direction: Split['direction'], area: Rect, contents: Contents): number | { fr: number; min?: number } {
  const size = part.size ?? { fr: 1 };
  if (size !== 'fit') return size;
  if (typeof part.content !== 'string') throw new TypeError("controlroom: only a pane can size 'fit'; a split has no content of its own");
  const lines = contents[part.content] ?? [];
  return direction === 'row' ? widest(lines) : lines.reduce((sum, line) => sum + lineCount(line, area.width), 0);
}

/**
 * The rectangle of every pane in `tree`, inside `area`. Panes are keyed by name; a name used
 * twice is a mistake in the tree and throws rather than silently drawing one pane twice.
 */
export function layout(tree: Layout, area: Rect, contents: Contents = {}): Map<string, Rect> {
  const rects = new Map<string, Rect>();
  const walk = (node: Layout, rect: Rect): void => {
    if (typeof node === 'string') {
      if (rects.has(node)) throw new TypeError(`controlroom: pane "${node}" appears twice in the layout`);
      rects.set(node, rect);
      return;
    }
    const row = node.direction === 'row';
    const cells = distribute(
      row ? rect.width : rect.height,
      node.parts.map((part) => resolve(part, node.direction, rect, contents)),
    );
    let at = row ? rect.x : rect.y;
    node.parts.forEach((part, i) => {
      const n = cells[i]!;
      walk(part.content, row ? { ...rect, x: at, width: n } : { ...rect, y: at, height: n });
      at += n;
    });
  };
  walk(tree, area);
  return rects;
}
