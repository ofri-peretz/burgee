/**
 * R9 — tabs, focus, collapse and scrolling, as a pure reducer, and the hint line generated from the
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
  /**
   * controlroom-scroll-pane R1 — each pane's first visible row. A pane with no entry, or with
   * `'end'`, is pinned to its bottom and follows new lines, as a log tail does.
   */
  readonly scroll: ReadonlyMap<string, number | 'end'>;
}

/** A laid-out pane's height: how many lines it holds, and how many rows its rectangle has. */
export interface Extent {
  readonly content: number;
  readonly rows: number;
}

/** The actions the reducer knows. Anything else is the program's own, and leaves the state alone. */
export type Action =
  | 'tab.next'
  | 'tab.prev'
  | 'focus.next'
  | 'focus.prev'
  | `tab:${string}`
  | `toggle:${string}`
  | 'scroll.up'
  | 'scroll.down'
  | 'scroll.pageUp'
  | 'scroll.pageDown'
  | 'scroll.top'
  | 'scroll.bottom'
  | 'resize';

export function initial(tabs: readonly string[] = [], panes: readonly string[] = []): ScreenState {
  return { tabs, active: 0, panes, focused: 0, collapsed: new Set(), scroll: new Map() };
}

/** The first row a pane shows, from its scroll entry, never past its last page. */
export const offset = (at: number | 'end' | undefined, max: number): number => (at === undefined || at === 'end' ? max : Math.min(at, max));

/** A row clamped into `[0, max]`, and the last page is `'end'`, so the pane follows its tail again. */
function settle(row: number, max: number): number | 'end' {
  const first = Math.max(0, row);
  return first < max ? first : 'end';
}

const lastPage = ({ content, rows }: Extent): number => Math.max(0, content - rows);

/**
 * R2 — how far each scroll action moves the focused pane: `[lines, pages]`, a page being its
 * rectangle's rows. Top and bottom move without limit, and `settle` stops them at either end.
 */
const SCROLL = new Map<string, readonly [number, number]>([
  ['scroll.up', [-1, 0]],
  ['scroll.down', [1, 0]],
  ['scroll.pageUp', [0, -1]],
  ['scroll.pageDown', [0, 1]],
  ['scroll.top', [-Infinity, 0]],
  ['scroll.bottom', [Infinity, 0]],
]);

/** R2 and R5 — a scroll action on the focused pane, or a resize on every pane; `undefined` for any other action. */
function scroll(state: ScreenState, action: string, extents: ReadonlyMap<string, Extent>): ScreenState | undefined {
  const by = SCROLL.get(action);
  const pane = state.panes[state.focused]!;
  const extent = extents.get(pane);
  if (by !== undefined && extent !== undefined) {
    const max = lastPage(extent);
    return { ...state, scroll: new Map(state.scroll).set(pane, settle(offset(state.scroll.get(pane), max) + by[0] + by[1] * extent.rows, max)) };
  }
  if (action !== 'resize') return undefined;
  // R5 — a size change re-clamps every numeric offset; one the new size reaches is `'end'`.
  const next = new Map(state.scroll);
  for (const [name, at] of next) {
    const of = extents.get(name);
    if (typeof at === 'number' && of !== undefined) next.set(name, settle(at, lastPage(of)));
  }
  return { ...state, scroll: next };
}

const cycle = (i: number, n: number): number => (n === 0 ? 0 : (i + n) % n);

/**
 * The next state. `extents` is every laid-out pane's height, which `compose` measures
 * (`extents()`): scrolling needs it, and without it a scroll action changes nothing.
 */
export function reduce(state: ScreenState, action: string, extents: ReadonlyMap<string, Extent> = new Map()): ScreenState {
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
  return scroll(state, action, extents) ?? state;
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
  pageup: 'PgUp',
  pagedown: 'PgDn',
  home: 'Home',
  end: 'End',
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
