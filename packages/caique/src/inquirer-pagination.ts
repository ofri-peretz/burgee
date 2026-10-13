/**
 * `@inquirer/core`'s `usePagination`: the window of a long list a prompt draws, and where the
 * cursor sits in it.
 *
 * Graded by `select`'s pagination suite in the `inquirer-prompts` host, which is where upstream
 * keeps it (D-20261011-inquirer-pagination-suite-is-selects), and by every `select` and
 * `checkbox` case that pages. The arithmetic is upstream's, step for step: the cases snapshot
 * the screen after each keypress, so a window that reaches the same page by another route
 * still draws a different frame on the way.
 */
import { readline, useRef } from './inquirer-hooks.js';
import { breakLines, outputWidth } from './inquirer-screen.js';

const sumLengths = (items: readonly string[][]): number => items.reduce((acc, item) => acc + item.length, 0);

/**
 * The row the active item is drawn on.
 *
 * A finite list keeps the cursor mid-page until an end of the list pulls it there. A looping
 * list never moves the cursor up, and moves it down at most to the middle, one item's height at
 * a time — so the page scrolls under a cursor that has stopped, as upstream's does.
 */
function usePointerPosition(active: number, renderedItems: readonly string[][], pageSize: number, loop: boolean): number {
  const state = useRef<{ lastPointer: number; lastActive: number | undefined }>({ lastPointer: active, lastActive: undefined });
  const { lastPointer, lastActive } = state.current;
  const middle = Math.floor(pageSize / 2);
  const defaultPointerPosition = sumLengths(renderedItems.slice(0, active));
  let pointer = defaultPointerPosition;

  if (sumLengths(renderedItems) > pageSize) {
    if (loop) {
      pointer = lastPointer;
      if (lastActive !== undefined && lastActive < active && active - lastActive < pageSize) {
        pointer = Math.min(
          middle,
          active - lastActive === 1 ? Math.min(lastPointer + sumLengths(renderedItems.slice(lastActive, active)), Math.max(defaultPointerPosition, lastPointer)) : lastPointer + active - lastActive,
        );
      }
    } else {
      const spaceUnderActive = sumLengths(renderedItems.slice(active));
      pointer = spaceUnderActive < pageSize - middle ? pageSize - spaceUnderActive : Math.min(defaultPointerPosition, middle);
    }
  }

  state.current.lastPointer = pointer;
  state.current.lastActive = active;
  return pointer;
}

/** One page of `items`, rendered around `active`, as the lines a prompt draws. */
export function usePagination<T>({
  items,
  active,
  renderItem,
  pageSize,
  loop = true,
}: {
  items: readonly T[];
  /** The index of the active item. */
  active: number;
  /** Renders an item as part of a page. */
  renderItem: (layout: { item: T; index: number; isActive: boolean }) => string;
  /** The size of the page. */
  pageSize: number;
  /** Allows creating an infinitely looping list. `true` if unspecified. */
  loop?: boolean;
}): string {
  const width = outputWidth(readline().output as { columns?: number });
  const bound = (num: number): number => ((num % items.length) + items.length) % items.length;
  const renderedItems = items.map((item, index) => (item == null ? [] : breakLines(renderItem({ item, index, isActive: index === active }), width).split('\n')));
  const looping = loop && sumLengths(renderedItems) > pageSize;
  const linesOf = (index: number): string[] => renderedItems[index] ?? [];

  const pointer = usePointerPosition(active, renderedItems, pageSize, loop);

  // The active item goes under the pointer when it fits there, and against the bottom when not.
  const activeItem = linesOf(active).slice(0, pageSize);
  const activeItemPosition = pointer + activeItem.length <= pageSize ? pointer : pageSize - activeItem.length;
  const pageBuffer: (string | undefined)[] = Array.from({ length: pageSize });
  pageBuffer.splice(activeItemPosition, activeItem.length, ...activeItem);
  // `active` starts visited, so a looping fill stops on reaching it from either side.
  const visited = new Set<number>([active]);

  // Below the active item, then above it, each until the page or the list runs out.
  let bufferPointer = activeItemPosition + activeItem.length;
  let itemPointer = bound(active + 1);
  while (bufferPointer < pageSize && !visited.has(itemPointer) && (looping || itemPointer > active)) {
    const lines = linesOf(itemPointer).slice(0, pageSize - bufferPointer);
    pageBuffer.splice(bufferPointer, lines.length, ...lines);
    visited.add(itemPointer);
    bufferPointer += lines.length;
    itemPointer = bound(itemPointer + 1);
  }

  bufferPointer = activeItemPosition - 1;
  itemPointer = bound(active - 1);
  while (bufferPointer >= 0 && !visited.has(itemPointer) && (looping || itemPointer < active)) {
    const all = linesOf(itemPointer);
    const lines = all.slice(Math.max(0, all.length - bufferPointer - 1));
    pageBuffer.splice(bufferPointer - lines.length + 1, lines.length, ...lines);
    visited.add(itemPointer);
    bufferPointer -= lines.length;
    itemPointer = bound(itemPointer - 1);
  }

  return pageBuffer.filter((line) => typeof line === 'string').join('\n');
}
