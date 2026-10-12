/**
 * `usePagination` — the window a list prompt draws of a list longer than its page.
 *
 * `@inquirer/core` publishes it, and `select` draws through it (`checkbox` and `search` do
 * upstream). It is graded by `@inquirer/select`'s `test/pagination.test.ts` — the pagination
 * suite upstream moved out of core when it rewrote this hook for multi-line choices — and by
 * every `select` case that scrolls (D-20261011-inquirer-pagination-suite-is-selects).
 *
 * ## The one number it keeps
 *
 * Every item is rendered and broken into terminal rows first, because a choice may span
 * several (a recipe with its ingredients under it). The page is then built around one row,
 * the **pointer**: the row of the page the active item's first row sits on.
 *
 * - **Looping**, the pointer stays where it was when the user moves up, and walks down
 *   towards the middle of the page when the user moves down, so the list scrolls under a
 *   cursor that settles in the middle and stays there.
 * - **Not looping**, the pointer is the active item's natural row until that would pass the
 *   middle, the middle while the list has more below, and then walks to the bottom as the
 *   end of the list comes into view.
 *
 * Looping depends on where the pointer was on the last render, which is why this is a hook:
 * the previous pointer and the previous active index live in a `useRef` slot of the prompt.
 */
import { readline, useRef } from './inquirer-hooks.js';
import { breakLines, outputWidth } from './inquirer-screen.js';

/** What `renderItem` is handed for each item of the list. */
export interface PaginationLayout<Item> {
  item: Item;
  index: number;
  isActive: boolean;
}

/** `usePagination`'s argument, named as the incumbent names it. */
export interface PaginationOptions<Item> {
  items: readonly Item[];
  /** The index of the active item. */
  active: number;
  /** Draw one item. Called for every item on every render, the active one included. */
  renderItem: (layout: PaginationLayout<Item>) => string;
  /** How many rows the page has. */
  pageSize: number;
  /** Whether the list comes round from one end to the other. `true` when omitted. */
  loop?: boolean;
}

type Rows = readonly (readonly string[])[];

/** The rows a run of items takes. */
const rowsIn = (rendered: Rows): number => rendered.reduce((total, rows) => total + rows.length, 0);

interface Placement {
  active: number;
  rendered: Rows;
  pageSize: number;
}

interface Memory {
  pointer: number;
  active: number | undefined;
}

/**
 * Looping: hold the pointer, except on a move down, which walks it towards the middle.
 *
 * A move of one item walks it by at most the height of the item it left, and never back up;
 * a longer move down (a number key, a search jump) walks it by the distance. A jump of a page
 * or more is read as having come round the end of the list, and holds.
 */
function loopingPointer({ active, rendered, pageSize }: Placement, previous: Memory): number {
  const last = previous.active;
  if (last === undefined || last >= active || active - last >= pageSize) return previous.pointer;
  const natural = rowsIn(rendered.slice(0, active));
  const walked = active - last === 1 ? Math.min(previous.pointer + rowsIn(rendered.slice(last, last + 1)), Math.max(natural, previous.pointer)) : previous.pointer + active - last;
  return Math.min(Math.floor(pageSize / 2), walked);
}

/** Not looping: the natural row up to the middle, then towards the bottom as the end nears. */
function finitePointer({ active, rendered, pageSize }: Placement): number {
  const middle = Math.floor(pageSize / 2);
  const below = rowsIn(rendered.slice(active));
  return below < pageSize - middle ? pageSize - below : Math.min(rowsIn(rendered.slice(0, active)), middle);
}

/** The row the active item's first row is drawn on, remembered across renders. */
function usePointer(placement: Placement, loop: boolean): number {
  const memory = useRef<Memory>({ pointer: placement.active, active: undefined });
  // A list that fits its page never scrolls: the active item sits on its own row.
  let pointer = rowsIn(placement.rendered.slice(0, placement.active));
  if (rowsIn(placement.rendered) > placement.pageSize) pointer = loop ? loopingPointer(placement, memory.current) : finitePointer(placement);
  memory.current = { pointer, active: placement.active };
  return pointer;
}

/**
 * Draw the page: the active item at the pointer, the items after it filling the rows below,
 * then the items before it filling the rows above.
 *
 * Each item is drawn once at most. A list that loops and overflows its page wraps round in
 * both directions; any other stops at its ends, so the page may be shorter than `pageSize`.
 * An item taller than the room left is cut where it meets the edge of the page, so the rows
 * nearest the active item are the ones kept.
 */
export function usePagination<Item>({ items, active, renderItem, pageSize, loop = true }: PaginationOptions<Item>): string {
  const width = outputWidth(readline().output);
  const count = items.length;
  const around = (index: number): number => ((index % count) + count) % count;

  const rendered: Rows = items.map((item, index) => (item == null ? [] : breakLines(renderItem({ item, index, isActive: index === active }), width).split('\n')));
  const rowsOf = (index: number): readonly string[] => rendered[index] ?? [];
  const circular = loop && rowsIn(rendered) > pageSize;

  const pointer = usePointer({ active, rendered, pageSize }, loop);

  const activeRows = rowsOf(active).slice(0, pageSize);
  const top = pointer + activeRows.length <= pageSize ? pointer : pageSize - activeRows.length;

  const page: (string | undefined)[] = Array.from({ length: pageSize });
  page.splice(top, activeRows.length, ...activeRows);
  const drawn = new Set<number>([active]);
  const reaches = (index: number, beyond: (index: number) => boolean): boolean => !drawn.has(index) && (circular ? index !== active : beyond(index));

  // Downwards, from the row under the active item.
  let row = top + activeRows.length;
  let index = around(active + 1);
  while (row < pageSize && reaches(index, (i) => i > active)) {
    const rows = rowsOf(index).slice(0, pageSize - row);
    page.splice(row, rows.length, ...rows);
    drawn.add(index);
    row += rows.length;
    index = around(index + 1);
  }

  // Upwards, from the row over it.
  row = top - 1;
  index = around(active - 1);
  while (row >= 0 && reaches(index, (i) => i < active)) {
    const all = rowsOf(index);
    const rows = all.slice(Math.max(0, all.length - row - 1));
    page.splice(row - rows.length + 1, rows.length, ...rows);
    drawn.add(index);
    row -= rows.length;
    index = around(index - 1);
  }

  return page.filter((line): line is string => typeof line === 'string').join('\n');
}
