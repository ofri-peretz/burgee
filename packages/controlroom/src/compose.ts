/**
 * R5 — the compositor's arithmetic. Several live components share one frame: each pane is
 * rendered by its own component, clipped to the rectangle `layout()` gave it, and the
 * rectangles are stitched into rows. The result is lines; writing them is flagstaff's
 * `frameWriter` (R15), so nothing here touches a stream.
 */
import { type Component } from 'flagstaff/plugin';
import { truncate, width } from 'linegauge';

import { layout, type Layout, type Part, type Rect } from './layout.js';
import { type Extent, offset, type ScreenState } from './tabs.js';

/** A pane: a flagstaff component, the state it is drawn with, and the label a static projection prints. */
export interface Pane<S = unknown> {
  component: Component<S>;
  state: S;
  label?: string;
  /**
   * Drawn on a live screen only, and left out of the static projection: a hint line or a tab
   * bar means nothing to a pipe, a screen reader or an agent, which get every pane instead (R6).
   */
  liveOnly?: boolean;
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

/**
 * `lines` cut to the rectangle: no more rows than it has, every row exactly its width. `at` is
 * the first row shown (controlroom-scroll-pane R3), and `'end'` shows the last rows. An offset
 * past the last page is read as the last page, so the view never sits past the content.
 */
export function fit(lines: readonly string[], rect: Pick<Rect, 'width' | 'height'>, at: number | 'end' = 0): string[] {
  const from = offset(at, Math.max(0, lines.length - rect.height));
  return Array.from({ length: rect.height }, (_, y) => {
    const line = truncate(lines[from + y] ?? '', rect.width, { position: 'end' });
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

/**
 * controlroom-scroll-pane R6 — the tree with every column part as tall as its content, so a
 * static frame cuts nothing: nobody reading it can press a key. A part sized 0 (collapsed)
 * stays out, and a row is as tall as its tallest part. Returns the tree and its height.
 */
function unfold(node: Layout, text: ReadonlyMap<string, readonly string[]>): [Layout, number] {
  if (typeof node === 'string') return [node, text.get(node)?.length ?? 0];
  const column = node.direction === 'column';
  const parts = node.parts.map((part): [Part, number] => {
    // The tree is the program's own layout, as deep as it wrote it: the recursion is bounded by it.
    // eslint-disable-next-line secure-coding/no-unchecked-loop-condition -- a walk over the program's own layout tree, as `collapse` and `layout` do
    const [content, need] = unfold(part.content, text);
    const asked = column && typeof part.size === 'number' ? part.size : need;
    const height = part.size === 0 ? 0 : Math.max(need, asked);
    return [column ? { size: height, content } : { ...part, content }, height];
  });
  const heights = parts.map(([, height]) => height);
  return [{ ...node, parts: parts.map(([part]) => part) }, column ? heights.reduce((a, b) => a + b, 0) : Math.max(0, ...heights)];
}

/** Every pane's text at `size.t`. */
const texts = (panes: Panes, size: Frame): Map<string, string[]> => new Map(Object.entries(panes).map(([name, pane]) => [name, render(pane, size.t, size.live)]));

/** Every pane the layout gives room, with its rectangle and its text. */
function place(tree: Layout, text: ReadonlyMap<string, string[]>, size: Frame): { name: string; rect: Rect; text: string[] }[] {
  return [...layout(tree, { x: 0, y: 0, width: size.columns, height: size.rows }, Object.fromEntries(text))]
    .filter(([name, rect]) => text.has(name) && rect.width > 0 && rect.height > 0)
    .map(([name, rect]) => ({ name, rect, text: text.get(name)! }));
}

/** controlroom-scroll-pane R2 — each laid-out pane's content and rectangle height, for `reduce`. */
export function extents(tree: Layout, panes: Panes, size: Frame): Map<string, Extent> {
  return new Map(place(tree, texts(panes, size), size).map(({ name, rect, text }) => [name, { content: text.length, rows: rect.height }]));
}

/**
 * The frame. Live, each pane shows from its scroll entry in `state` (pinned to its bottom when
 * it has none), and the focused pane, when lines are below it, says how many in its last row.
 * Not live, scroll state never reaches it and every line of every pane is printed (R6).
 */
export function compose(tree: Layout, panes: Panes, size: Frame, state?: Pick<ScreenState, 'panes' | 'focused' | 'scroll'>): string[] {
  const text = texts(panes, size);
  if (!size.live) {
    const [grown, height] = unfold(tree, text);
    tree = grown;
    size = { ...size, rows: Math.max(size.rows, height) };
  }
  const rects = place(tree, text, size)
    .map(({ name, rect, text }) => {
      const at = size.live ? (state?.scroll.get(name) ?? 'end') : 0;
      const lines = fit(text, rect, at);
      const below = text.length - offset(at, Math.max(0, text.length - rect.height)) - rect.height;
      if (below > 0 && name === state?.panes[state.focused]) lines[rect.height - 1] = fit([`↓ ${below}`], { width: rect.width, height: 1 })[0]!;
      return { rect, lines };
    })
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
