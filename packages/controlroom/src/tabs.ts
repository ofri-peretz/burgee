/**
 * R9 — tabs, focus and collapse, as a pure reducer, and the hint line generated from the
 * active keymap. The hint is derived, never written: a key that is not bound cannot appear in
 * it, and a bound action with a label cannot be missing from it.
 *
 * A keymap is data (caique R2): key spec → action name. Nothing here reads a key.
 */

/** Key spec → action name, e.g. `{ left: 'tab.prev', s: 'toggle:status' }`. */
export type Keymap = Readonly<Record<string, string>>;

export interface ScreenState {
  readonly tabs: readonly string[];
  readonly active: number;
  /** Panes that take focus, in focus order. */
  readonly panes: readonly string[];
  readonly focused: number;
  readonly collapsed: ReadonlySet<string>;
}

/** The actions the reducer knows. Anything else is the program's own, and leaves the state alone. */
export type Action = 'tab.next' | 'tab.prev' | 'focus.next' | 'focus.prev' | `tab:${string}` | `toggle:${string}`;

export function initial(tabs: readonly string[] = [], panes: readonly string[] = []): ScreenState {
  return { tabs, active: 0, panes, focused: 0, collapsed: new Set() };
}

const cycle = (i: number, n: number): number => (n === 0 ? 0 : (i + n) % n);

export function reduce(state: ScreenState, action: string): ScreenState {
  switch (action) {
    case 'tab.next':
      return { ...state, active: cycle(state.active + 1, state.tabs.length) };
    case 'tab.prev':
      return { ...state, active: cycle(state.active - 1, state.tabs.length) };
    case 'focus.next':
      return { ...state, focused: cycle(state.focused + 1, state.panes.length) };
    case 'focus.prev':
      return { ...state, focused: cycle(state.focused - 1, state.panes.length) };
  }
  if (action.startsWith('tab:')) {
    const i = state.tabs.indexOf(action.slice('tab:'.length));
    return i < 0 ? state : { ...state, active: i };
  }
  if (action.startsWith('toggle:')) {
    const section = action.slice('toggle:'.length);
    const collapsed = new Set(state.collapsed);
    if (!collapsed.delete(section)) collapsed.add(section);
    return { ...state, collapsed };
  }
  return state;
}

/** How a key spec reads in a hint. Unlisted keys read as themselves. */
const GLYPH: Readonly<Record<string, string>> = {
  left: '←',
  right: '→',
  up: '↑',
  down: '↓',
  enter: '⏎',
  escape: 'esc',
  'shift+tab': '⇧tab',
};

const spell = (key: string): string => GLYPH[key] ?? key.replace(/^ctrl\+(.)$/u, (_, c: string) => `^${c.toUpperCase()}`);

/**
 * The hint line for `keymap`: one entry per label, its keys run together in keymap order —
 * `←→ switch tab  s toggle status`. An action with no label is bound but not advertised.
 * Arrows read best run together (`←→`); any other set of keys is joined by a slash (`q/^C`).
 */
export function hints(keymap: Keymap, labels: Readonly<Record<string, string>>): string {
  const byLabel = new Map<string, string[]>();
  for (const [key, action] of Object.entries(keymap)) {
    const label = labels[action];
    if (label !== undefined) byLabel.set(label, [...(byLabel.get(label) ?? []), spell(key)]);
  }
  return [...byLabel].map(([label, keys]) => `${keys.join(/^[←→↑↓]+$/u.test(keys.join('')) ? '' : '/')} ${label}`).join('  ');
}
