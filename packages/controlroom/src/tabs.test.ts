import { describe, expect, it } from 'vitest';

import { registered } from './plugin.js';
import { type Extent, hints, initial, reduce, type ScreenState } from './tabs.js';

const tabs = ['Status', 'Tail logs', 'Visualizer', 'HN'];

describe('reduce — tabs', () => {
  it('next and prev wrap around both ends', () => {
    let s = initial(tabs);
    s = reduce(s, 'tab.prev');
    expect(s.active).toBe(3);
    s = reduce(s, 'tab.next');
    expect(s.active).toBe(0);
  });

  it('jumps to a tab by name, and ignores a name that is not a tab', () => {
    const s = reduce(initial(tabs), 'tab:Visualizer');
    expect(s.active).toBe(2);
    expect(reduce(s, 'tab:Nope')).toBe(s);
  });

  it('a screen with no tabs stays at zero instead of dividing by it', () => {
    expect(reduce(initial(), 'tab.next').active).toBe(0);
  });
});

describe('reduce — focus', () => {
  it('moves through panes in focus order and wraps', () => {
    let s = initial([], ['learn', 'tasks', 'log']);
    s = reduce(s, 'focus.next');
    s = reduce(s, 'focus.next');
    s = reduce(s, 'focus.next');
    expect(s.focused).toBe(0);
    expect(reduce(s, 'focus.prev').focused).toBe(2);
  });
});

describe('reduce — collapse', () => {
  it('a toggle collapses, the same toggle expands, and the old state is not mutated', () => {
    const open = initial();
    const shut = reduce(open, 'toggle:status');
    expect(shut.collapsed.has('status')).toBe(true);
    expect(open.collapsed.has('status')).toBe(false);
    expect(reduce(shut, 'toggle:status').collapsed.has('status')).toBe(false);
  });

  it("an action that is the program's own leaves the state alone", () => {
    const s = initial(tabs);
    expect(reduce(s, 'app:refresh')).toBe(s);
  });
});

describe('hints — generated from the keymap', () => {
  const labels = { 'tab.prev': 'switch tab', 'tab.next': 'switch tab', 'toggle:status': 'toggle status', quit: 'quit' };

  it('reads like the intent: arrows run together, labels in keymap order', () => {
    expect(hints({ left: 'tab.prev', right: 'tab.next', s: 'toggle:status' }, labels)).toBe('←→ switch tab  s toggle status');
  });

  it('cannot name a key that is not bound: unbind it and it leaves the hint', () => {
    expect(hints({ right: 'tab.next', s: 'toggle:status' }, labels)).toBe('→ switch tab  s toggle status');
    expect(hints({ s: 'toggle:status' }, labels)).not.toMatch(/switch tab/u);
  });

  it('joins non-arrow keys for one action with a slash, and spells ctrl and the named keys', () => {
    expect(hints({ q: 'quit', 'ctrl+c': 'quit' }, labels)).toBe('q/^C quit');
    expect(hints({ up: 'a', down: 'a', enter: 'b', escape: 'c', 'shift+tab': 'd' }, { a: 'move', b: 'open', c: 'back', d: 'prev' })).toBe(
      '↑↓ move  ⏎ open  esc back  ⇧tab prev',
    );
  });

  it('a bound action with no label is bound but not advertised', () => {
    expect(hints({ x: 'secret' }, labels)).toBe('');
  });
});

/** controlroom-scroll-pane: one 200-line pane in a 20-row rectangle, unless a test says otherwise. */
const LOG = (content = 200, rows = 20): ReadonlyMap<string, Extent> => new Map([['log', { content, rows }]]);
const at = (s: ScreenState): number | 'end' | undefined => s.scroll.get('log');

const scrolled = (n: number): ScreenState => ({ ...initial([], ['log']), scroll: new Map([['log', n]]) });

/** mulberry32: a seeded generator, so a failure names a sequence that can be replayed. */
const random = (seed: number) => (): number => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
};

describe('reduce — scroll (controlroom-scroll-pane R1, R2)', () => {
  const start = initial([], ['log']);

  it('R1 — a pane with no entry is pinned to its bottom: a fresh state has none', () => {
    expect(start.scroll.size).toBe(0);
  });

  it('S1 — Home shows row 1, PgDn a page further, End pins it to the bottom again', () => {
    let s = reduce(start, 'scroll.top', LOG());
    expect(at(s)).toBe(0);
    s = reduce(s, 'scroll.pageDown', LOG());
    expect(at(s)).toBe(20);
    s = reduce(s, 'scroll.down', LOG());
    expect(at(s)).toBe(21);
    s = reduce(s, 'scroll.up', LOG());
    expect(at(s)).toBe(20);
    s = reduce(s, 'scroll.pageUp', LOG());
    expect(at(s)).toBe(0);
    expect(at(reduce(s, 'scroll.up', LOG())), 'clamped at the first row').toBe(0);
    expect(at(reduce(s, 'scroll.pageUp', LOG()))).toBe(0);
    expect(at(reduce(s, 'scroll.bottom', LOG()))).toBe('end');
  });

  it('a step from the bottom starts at the last page, and reaching the last page again is `end`', () => {
    const up = reduce(start, 'scroll.up', LOG());
    expect(at(up)).toBe(179);
    expect(at(reduce(start, 'scroll.pageUp', LOG()))).toBe(160);
    expect(at(reduce(up, 'scroll.down', LOG()))).toBe('end');
    expect(at(reduce(reduce(start, 'scroll.pageUp', LOG()), 'scroll.pageDown', LOG()))).toBe('end');
    expect(at(reduce(reduce(start, 'scroll.top', LOG()), 'scroll.pageDown', LOG(25)))).toBe('end');
  });

  it('a pane whose content fits its rectangle never leaves its bottom', () => {
    expect(at(reduce(start, 'scroll.top', LOG(5)))).toBe('end');
    expect(at(reduce(start, 'scroll.top', LOG(20)))).toBe('end');
    expect(at(reduce(start, 'scroll.up', LOG(5))), 'a row above the first is still the last page here').toBe('end');
  });

  it('moves the focused pane only; with no focus, or no extent for it, the state is returned as it was', () => {
    const two = initial([], ['other', 'log']);
    expect(reduce(two, 'scroll.top', LOG())).toBe(two);
    expect(at(reduce(reduce(two, 'focus.next'), 'scroll.top', LOG()))).toBe(0);
    expect(reduce(initial(), 'scroll.top', LOG())).toEqual(initial());
    expect(reduce(start, 'scroll.top')).toBe(start);
  });

  it('does not mutate the state it was given', () => {
    const scrolled = reduce(start, 'scroll.top', LOG());
    reduce(scrolled, 'scroll.down', LOG());
    expect(at(scrolled)).toBe(0);
    expect(start.scroll.size).toBe(0);
  });
});

describe('reduce — resize (controlroom-scroll-pane R5)', () => {
  it('re-clamps every numeric offset, and one that reaches the new maximum becomes `end`', () => {
    expect(at(reduce(scrolled(150), 'resize', LOG(200, 10)))).toBe(150);
    expect(at(reduce(scrolled(150), 'resize', LOG(200, 60)))).toBe('end');
    expect(at(reduce(scrolled(140), 'resize', LOG(200, 60)))).toBe('end');
    expect(at(reduce(scrolled(139), 'resize', LOG(200, 60)))).toBe(139);
  });

  it('leaves `end`, and a pane that is not laid out, where they are', () => {
    const end = { ...initial([], ['log']), scroll: new Map<string, number | 'end'>([['log', 'end'], ['hidden', 3]]) };
    const after = reduce(end, 'resize', LOG(200, 60));
    expect([...after.scroll]).toEqual([['log', 'end'], ['hidden', 3]]);
  });
});

describe('property — the offset stays in [0, max) over 1,000 random action sequences (R1, R2, R5)', () => {
  const ACTIONS = ['scroll.up', 'scroll.down', 'scroll.pageUp', 'scroll.pageDown', 'scroll.top', 'scroll.bottom', 'resize', 'append'] as const;

  it('holds after every step, whether a key, a resize or a new line', () => {
    for (let seq = 0; seq < 1000; seq += 1) {
      const r = random(seq);
      const int = (n: number): number => Math.floor(r() * n);
      let content = int(300);
      let rows = 1 + int(40);
      let s = initial([], ['log']);
      for (let step = 0; step < 30; step += 1) {
        const action = ACTIONS[int(ACTIONS.length)]!;
        if (action === 'append') content += int(5);
        else {
          if (action === 'resize') rows = 1 + int(40);
          s = reduce(s, action, LOG(content, rows));
        }
        const value = at(s);
        const max = Math.max(0, content - rows);
        if (typeof value === 'number') expect(value >= 0 && value < max && Number.isInteger(value), `sequence ${seq}, step ${step}: ${value} outside [0, ${max})`).toBe(true);
      }
    }
  });
});

describe('R4 — scrolling in the default keymap and its hint line', () => {
  it('binds ↑↓, PgUp/PgDn and Home/End to the scroll actions, and hints() lists them', () => {
    const def = registered().keymaps.get('default')!;
    expect(def.keys).toMatchObject({ up: 'scroll.up', down: 'scroll.down', pageup: 'scroll.pageUp', pagedown: 'scroll.pageDown', home: 'scroll.top', end: 'scroll.bottom' });
    expect(hints(def.keys, def.labels)).toContain('↑↓ scroll  PgUp/PgDn page  Home/End jump');
  });
});
