/**
 * R5 — the compositor's arithmetic. Several live components share one frame: each pane is
 * rendered by its own component, clipped to the rectangle `layout()` gave it, and the
 * rectangles are stitched into rows. The result is lines; writing them is flagstaff's
 * `frameWriter` (R15), so nothing here touches a stream.
 */
import { type Component } from 'flagstaff/plugin';
import { truncate, width } from 'linegauge';

import { layout, type Layout, type Part, type Rect } from './layout.js';

/** A pane: a flagstaff component, the state it is drawn with, and the label a static projection prints. */
export interface Pane<S = unknown> {
  component: Component<S>;
  state: S;
  label?: string;
}

export type Panes = Readonly<Record<string, Pane>>;

/**
 * A pane's text at time `t`: its animated `frame` when it has one and `live` is set, its
 * static projection otherwise.
 */
export function render(pane: Pane, t: number, live: boolean): string[] {
  const { component, state } = pane;
  return (live && component.frame !== undefined ? component.frame(t, state) : component.static(state)).split('\n');
}

/** `lines` cut to the rectangle: no more rows than it has, every row exactly its width. */
export function fit(lines: readonly string[], rect: Pick<Rect, 'width' | 'height'>): string[] {
  return Array.from({ length: rect.height }, (_, y) => {
    const line = truncate(lines[y] ?? '', rect.width, { position: 'end' });
    return line + ' '.repeat(Math.max(0, rect.width - width(line)));
  });
}

/** The tree with every collapsed pane given no rows or columns. */
export function collapse(tree: Layout, collapsed: ReadonlySet<string>): Layout {
  if (typeof tree === 'string') return tree;
  return {
    ...tree,
    parts: tree.parts.map(
      (part): Part => (typeof part.content === 'string' && collapsed.has(part.content) ? { ...part, size: 0 } : { ...part, content: collapse(part.content, collapsed) }),
    ),
  };
}

/**
 * The whole frame, `rows` lines of `columns` cells. A row a rectangle does not cover is
 * spaces, so the frame always replaces whatever was under it.
 */
export interface Frame {
  columns: number;
  rows: number;
  /** Milliseconds since the screen opened, for animated panes. */
  t: number;
  /** Whether animated panes draw their `frame`; a final, settled frame uses each static projection. */
  live: boolean;
}

export function compose(tree: Layout, panes: Panes, size: Frame): string[] {
  const text = new Map(Object.entries(panes).map(([name, pane]) => [name, render(pane, size.t, size.live)]));
  const rects = [...layout(tree, { x: 0, y: 0, width: size.columns, height: size.rows }, Object.fromEntries(text))]
    .filter(([name, rect]) => text.has(name) && rect.width > 0 && rect.height > 0)
    .map(([name, rect]) => ({ rect, lines: fit(text.get(name)!, rect) }))
    .sort((a, b) => a.rect.x - b.rect.x);
  return Array.from({ length: size.rows }, (_, y) => {
    let x = 0;
    let row = '';
    for (const { rect, lines } of rects) {
      if (y < rect.y || y >= rect.y + rect.height) continue;
      row += ' '.repeat(Math.max(0, rect.x - x)) + lines[y - rect.y]!;
      x = rect.x + rect.width;
    }
    return row + ' '.repeat(Math.max(0, size.columns - x));
  });
}
