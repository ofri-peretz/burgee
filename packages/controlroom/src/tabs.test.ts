import { describe, expect, it } from 'vitest';

import { hints, initial, reduce } from './tabs.js';

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
