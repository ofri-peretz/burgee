import { describe, expect, it } from 'vitest';

import { distribute, layout, type Layout } from './layout.js';

const area = { x: 0, y: 0, width: 80, height: 24 };

describe('distribute — one axis', () => {
  it('gives fixed parts their cells and shares the rest by fraction', () => {
    expect(distribute(80, [20, { fr: 1 }, { fr: 3 }])).toEqual([20, 15, 45]);
  });

  it('fills every cell: rounding leftovers go to the earliest fractional parts', () => {
    expect(distribute(10, [{ fr: 1 }, { fr: 1 }, { fr: 1 }])).toEqual([4, 3, 3]);
    expect(distribute(11, [{ fr: 1 }, 2, { fr: 1 }, { fr: 1 }])).toEqual([3, 2, 3, 3]);
  });

  it('a minimum holds even when the fraction would give less, and the rest re-share', () => {
    expect(distribute(20, [{ fr: 1, min: 12 }, { fr: 1 }, { fr: 1 }])).toEqual([12, 4, 4]);
  });

  it('a minimum below the share is just a floor, not extra', () => {
    expect(distribute(20, [{ fr: 1, min: 2 }, { fr: 1 }])).toEqual([10, 10]);
  });

  it('every part held at its minimum: nobody shrinks below it', () => {
    expect(distribute(10, [{ fr: 1, min: 6 }, { fr: 1, min: 4 }])).toEqual([6, 4]);
  });

  it('too small for the minimums: the later parts are clipped, the first stays whole', () => {
    expect(distribute(10, [8, { fr: 1, min: 5 }, 3])).toEqual([8, 2, 0]);
  });

  it('only fixed parts: leftover cells stay empty rather than inflating a fixed size', () => {
    expect(distribute(10, [3, 4])).toEqual([3, 4]);
  });

  it('a zero fraction takes only its minimum', () => {
    expect(distribute(10, [{ fr: 0, min: 2 }, { fr: 1 }])).toEqual([2, 8]);
  });

  it('negative and fractional totals are floored at zero cells', () => {
    expect(distribute(-5, [{ fr: 1 }, 3])).toEqual([0, 0]);
    expect(distribute(7.9, [{ fr: 1 }])).toEqual([7]);
  });
});

describe('layout — the PostHog-wizard screen from the intent', () => {
  const screen: Layout = {
    direction: 'column',
    parts: [
      { size: 1, content: 'tabs' },
      { content: { direction: 'row', parts: [{ content: 'learn' }, { size: { fr: 2, min: 30 }, content: 'tasks' }] } },
      { size: 6, content: 'log' },
      { size: 'fit', content: 'hints' },
    ],
  };

  it('every pane gets a rectangle, and together they tile the screen', () => {
    const rects = layout(screen, area, { hints: ['←→ switch tab  s toggle status'] });
    expect(Object.fromEntries(rects)).toEqual({
      tabs: { x: 0, y: 0, width: 80, height: 1 },
      learn: { x: 0, y: 1, width: 27, height: 16 },
      tasks: { x: 27, y: 1, width: 53, height: 16 },
      log: { x: 0, y: 17, width: 80, height: 6 },
      hints: { x: 0, y: 23, width: 80, height: 1 },
    });
  });

  it('a resize lays out again from the same tree', () => {
    const rects = layout(screen, { x: 0, y: 0, width: 40, height: 12 }, { hints: ['x'] });
    expect(rects.get('learn')).toEqual({ x: 0, y: 1, width: 10, height: 4 });
    expect(rects.get('tasks')).toEqual({ x: 10, y: 1, width: 30, height: 4 });
  });
});

describe("layout — 'fit'", () => {
  it('in a row, fits the widest line as linegauge measures it (wide and ANSI-styled text included)', () => {
    const tree: Layout = { direction: 'row', parts: [{ size: 'fit', content: 'side' }, { content: 'main' }] };
    const rects = layout(tree, area, { side: ['ab', '\u001B[1m日本語\u001B[22m'] });
    expect(rects.get('side')?.width).toBe(6);
    expect(rects.get('main')).toEqual({ x: 6, y: 0, width: 74, height: 24 });
  });

  it('in a column, fits the rows the lines wrap to at the area width', () => {
    const tree: Layout = { direction: 'column', parts: [{ size: 'fit', content: 'top' }, { content: 'rest' }] };
    const rects = layout(tree, { x: 0, y: 0, width: 4, height: 10 }, { top: ['abcdefgh', 'x'] });
    expect(rects.get('top')?.height).toBe(3);
  });

  it('a pane with no content fits to nothing', () => {
    const tree: Layout = { direction: 'column', parts: [{ size: 'fit', content: 'empty' }, { content: 'rest' }] };
    expect(layout(tree, area).get('empty')?.height).toBe(0);
  });

  it('a split cannot fit: it has no content of its own', () => {
    const tree: Layout = { direction: 'row', parts: [{ size: 'fit', content: { direction: 'column', parts: [] } }] };
    expect(() => layout(tree, area)).toThrow(/only a pane can size 'fit'/u);
  });
});

describe('layout — mistakes in the tree', () => {
  it('a pane named twice throws instead of drawing twice', () => {
    const tree: Layout = { direction: 'row', parts: [{ content: 'a' }, { content: 'a' }] };
    expect(() => layout(tree, area)).toThrow(/pane "a" appears twice/u);
  });

  it('a single pane takes the whole area', () => {
    expect(layout('only', area).get('only')).toEqual(area);
  });
});
