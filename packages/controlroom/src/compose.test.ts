import { type Component } from 'flagstaff/plugin';
import { describe, expect, it } from 'vitest';

import { collapse, compose, extents, fit, render } from './compose.js';
import { type Layout } from './layout.js';
import { initial, type ScreenState } from './tabs.js';

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

/** controlroom-scroll-pane: 200 numbered lines. */
const tall = Array.from({ length: 200 }, (_, i) => `line ${i + 1}`);
const pad = (line: string, n = 10): string => line.padEnd(n);

/** A screen state with `log` focused (or the `focus` given) and scrolled to `at`, or with no entry. */
const state = (at?: number | 'end', focus = ['log']): ScreenState => ({ ...initial([], focus), scroll: new Map(at === undefined ? [] : [['log', at]]) });

describe('fit — from an offset (controlroom-scroll-pane R3)', () => {
  it('slices from a numeric offset, and `end` slices the last rows', () => {
    expect(fit(tall, { width: 8, height: 3 }, 20)).toEqual(['line 21 ', 'line 22 ', 'line 23 ']);
    expect(fit(tall, { width: 8, height: 2 }, 'end')).toEqual(['line 199', 'line 200']);
  });

  it('an offset past the end is clamped, so the view never sits past the content (R5)', () => {
    expect(fit(tall, { width: 8, height: 2 }, 500)).toEqual(['line 199', 'line 200']);
    expect(fit(['a'], { width: 1, height: 2 }, 'end')).toEqual(['a', ' ']);
  });
});

describe('compose — a scrolled pane (controlroom-scroll-pane R1, R4, R6, S1–S3)', () => {
  const log = (lines = tall) => ({ log: { component: text, state: lines.join('\n') } });
  const size = { columns: 10, rows: 20, t: 0, live: true };

  it('R1 — a pane with no entry is pinned to its bottom', () => {
    const frame = compose('log', log(), size, state());
    expect(frame[0]).toBe(pad('line 181'));
    expect(frame[19]).toBe(pad('line 200'));
  });

  it('S1, R4 — at the top it shows row 1 on, and its last row says `↓ 180`; a page down says `↓ 160`', () => {
    const top = compose('log', log(), size, state(0));
    expect(top.slice(0, 19)).toEqual(tall.slice(0, 19).map((line) => pad(line)));
    expect(top[19]).toBe(pad('↓ 180'));
    const page = compose('log', log(), size, state(20));
    expect(page[0]).toBe(pad('line 21'));
    expect(page[19]).toBe(pad('↓ 160'));
  });

  it('S1 — a new line at the end stays visible while the pane is at its bottom', () => {
    const more = [...tall, 'line 201'];
    expect(compose('log', log(more), size, state('end')).at(-1)).toBe(pad('line 201'));
  });

  it('S2 — scrolled up, a new line does not move the view, and the hint counts it', () => {
    const frame = compose('log', log([...tall, 'line 201']), size, state(0));
    expect(frame[0]).toBe(pad('line 1'));
    expect(frame[19]).toBe(pad('↓ 181'));
  });

  it('the hint is drawn for the focused pane only', () => {
    expect(compose('log', log(), size, state(0, []))[19]).toBe(pad('line 20'));
  });

  it('R6 — `live: false` prints all 200 lines whatever the scroll state, and no hint', () => {
    const still = { ...size, live: false };
    expect(compose('log', log(), still, state(50))).toEqual(tall.map((line) => pad(line)));
    expect(compose('log', log(), still)).toEqual(tall.map((line) => pad(line)));
  });

  it('R6 — a static frame gives each column part its content, keeps a collapsed pane out, and makes a row as tall as its tallest pane', () => {
    const still = { columns: 4, rows: 2, t: 0, live: false };
    const panes = { a: { component: text, state: 'a1\na2\na3' }, b: { component: text, state: 'b1' }, c: { component: text, state: 'c1\nc2' }, gone: { component: text, state: 'x' } };
    const tree: Layout = {
      direction: 'column',
      parts: [
        { size: 1, content: 'a' },
        { size: 0, content: 'gone' },
        { size: 2, content: 'b' },
        { content: { direction: 'row', parts: [{ size: 2, content: 'c' }, { size: 0, content: 'gone2' }, { content: 'd' }] } },
      ],
    };
    expect(compose(tree, { ...panes, d: { component: text, state: 'd' } }, still)).toEqual(['a1  ', 'a2  ', 'a3  ', 'b1  ', '    ', 'c1d ', 'c2  ']);
    expect(compose('b', panes, { ...still, rows: 3 }), 'never shorter than the frame it was given').toEqual(['b1  ', '    ', '    ']);
  });
});

describe('extents — what the reducer is given (controlroom-scroll-pane R2)', () => {
  it("is each laid-out pane's content height and rectangle height, and skips a pane with no room", () => {
    const tree: Layout = { direction: 'column', parts: [{ size: 3, content: 'log' }, { size: 0, content: 'gone' }, { content: 'missing' }] };
    const panes = { log: { component: text, state: tall.join('\n') }, gone: { component: text, state: 'x' } };
    expect([...extents(tree, panes, { columns: 10, rows: 5, t: 0, live: true })]).toEqual([['log', { content: 200, rows: 3 }]]);
  });
});
