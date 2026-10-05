/**
 * A tab bar, as a component (controlroom R3): `Status · Tail logs · Visualizer`, with the
 * active tab styled through roundel's `heading` token. Output only — which tab is active is
 * the program's state, and the key that changes it is controlroom's; this draws and reads no
 * keys.
 *
 * The static projection is the active tab's label and nothing else: a pipe, an agent or a
 * screen reader is told which view it is reading, once per switch, not a row of every tab.
 *
 * When `heading` paints nothing — no colour, or a theme that leaves it plain — the active tab
 * is bracketed instead, so a terminal without colour still shows which one it is. Importing
 * this module registers the built-in `tab-bar` component through the public `register()`,
 * the door a plugin uses to replace it.
 */
import { heading, muted } from 'roundel/tokens';

import { type Component, register } from './plugin.js';

export interface TabBarState {
  /** The labels, in order. */
  tabs: readonly string[];
  /** Index of the active tab. Out of range, no tab is active and the static is empty. */
  active: number;
}

export interface TabBarOptions {
  /** Drawn between tabs, muted. Default ` · `. */
  separator?: string;
}

const SEPARATOR = ' · ';

/** The active label, painted — or bracketed when painting changes nothing. */
function marked(label: string): string {
  const painted = heading(label);
  return painted === label ? `[${label}]` : painted;
}

/** A tab bar: the active label off a terminal, every tab with the active one marked on one. */
export function tabBar({ separator = SEPARATOR }: TabBarOptions = {}): Component<TabBarState> {
  return {
    name: 'tab-bar',
    static: ({ tabs, active }) => tabs[active] ?? '',
    frame: (_t, { tabs, active }) => tabs.map((tab, i) => (i === active ? marked(tab) : muted(tab))).join(muted(separator)),
  };
}

const builtin = tabBar();
register({
  name: 'flagstaff',
  components: {
    'tab-bar': {
      static: builtin.static,
      frame: builtin.frame,
      sample: {
        running: { tabs: ['Status', 'Tail logs', 'Visualizer'], active: 0 },
        done: { tabs: ['Status', 'Tail logs', 'Visualizer'], active: 1 },
      },
    },
  },
});
