import { type Component } from 'flagstaff/plugin';
import { describe, expect, it } from 'vitest';

import { collapse, compose, fit, render } from './compose.js';
import { type Layout } from './layout.js';

const text: Component<string> = { name: 'text', static: (s) => s };
const animated: Component<string> = { name: 'anim', static: (s) => `done ${s}`, frame: (t, s) => `${t} ${s}` };

describe('render', () => {
  it('uses the animated frame only when live, and the static projection otherwise', () => {
    expect(render({ component: animated, state: 'x' }, 5, true)).toEqual(['5 x']);
    expect(render({ component: animated, state: 'x' }, 5, false)).toEqual(['done x']);
    expect(render({ component: text, state: 'a\nb' }, 0, true)).toEqual(['a', 'b']);
  });
});

describe('fit', () => {
  it('clips rows, truncates long lines, and pads short and wide-character lines to the exact width', () => {
    expect(fit(['abcdef', '日本', 'x', 'dropped'], { width: 4, height: 3 })).toEqual(['abc…', '日本', 'x   ']);
    expect(fit([], { width: 2, height: 1 })).toEqual(['  ']);
  });
});

describe('collapse', () => {
  it('gives a collapsed pane no size, at any depth, and leaves the rest alone', () => {
    const tree: Layout = { direction: 'column', parts: [{ content: 'a' }, { content: { direction: 'row', parts: [{ content: 'b' }, { content: 'c' }] } }] };
    expect(collapse(tree, new Set(['b']))).toEqual({
      direction: 'column',
      parts: [{ content: 'a' }, { content: { direction: 'row', parts: [{ content: 'b', size: 0 }, { content: 'c' }] } }],
    });
    expect(collapse('a', new Set(['a']))).toBe('a');
  });
});

describe('compose', () => {
  it('stitches side-by-side panes into rows of exactly the frame width', () => {
    const tree: Layout = { direction: 'row', parts: [{ size: 4, content: 'l' }, { content: 'r' }] };
    const frame = compose(tree, { l: { component: text, state: 'ab\ncd' }, r: { component: text, state: 'xyz' } }, { columns: 8, rows: 2, t: 0, live: true });
    expect(frame).toEqual(['ab  xyz ', 'cd      ']);
  });

  it('a row no pane covers is spaces, and a pane without content in the layout is skipped', () => {
    const tree: Layout = { direction: 'column', parts: [{ size: 1, content: 'top' }, { size: 1, content: 'ghost' }] };
    expect(compose(tree, { top: { component: text, state: 'hi' } }, { columns: 3, rows: 3, t: 0, live: true })).toEqual(['hi ', '   ', '   ']);
  });

  it('a gap between fixed panes is filled, so the frame replaces whatever was under it', () => {
    const tree: Layout = { direction: 'row', parts: [{ size: 2, content: 'a' }, { size: 0, content: 'gone' }, { size: 2, content: 'b' }] };
    expect(compose(tree, { a: { component: text, state: 'aa' }, gone: { component: text, state: 'x' }, b: { component: text, state: 'bb' } }, { columns: 6, rows: 1, t: 0, live: true })).toEqual([
      'aabb  ',
    ]);
  });
});
