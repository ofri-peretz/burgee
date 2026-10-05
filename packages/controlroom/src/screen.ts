/**
 * R4, R6, R7, R19 — a screen's life, and the only file that asks roundel for the mode.
 *
 * `open()` decides once. A `tty` whose stdin can go raw gets the live screen: `'inline'` (the
 * default, Ink's shape) keeps the main screen and repaints a live region under a committed
 * region that flows into scrollback; `'alternate'` takes the whole terminal. Every other
 * caller gets the static session: each pane's own static projection, in declared order and
 * under its label, or NDJSON on stderr under `--json`. Nothing here ever waits for a key, so
 * a pipe, CI, a screen reader or an agent can never hang on a screen (R7).
 *
 * Every byte goes out through flagstaff (`frameWriter`, `hoist`) or closeout (the alternate
 * screen, the cursor, raw mode, each with its restore registered in the same call). This file
 * lays out and routes keys; it never paints (R15).
 */
import { type KeyPress, match, readKeys, canReadKeys, type Keymap } from 'caique/keys';
import { onExit } from 'closeout';
import { alternateScreen, hideCursor, type Registrar } from 'closeout/cursor';
import { frameWriter, type FrameWriter, hoist, type Hoisted } from 'flagstaff/loop';
import { type Component, registered as flagstaffRegistered } from 'flagstaff/plugin';
import { outputMode, type OutputMode } from 'roundel/policy';

import { collapse, compose, type Pane, type Panes } from './compose.js';
import { type Layout } from './layout.js';
import { registered } from './plugin.js';
import { type Runtime } from './runtime.js';
import { initial, reduce, type ScreenState } from './tabs.js';

export interface ScreenOptions {
  /** `'inline'` (the default) keeps the main screen; `'alternate'` takes the whole terminal. */
  screen?: 'inline' | 'alternate';
  /** The panes' arrangement, or a function of the screen state when tabs change what is shown. */
  layout: Layout | ((state: ScreenState) => Layout);
  /** Each pane is a component with its state, or a registered pane (R10) by name with its state. */
  panes: Readonly<Record<string, Pane | { pane: string; state: unknown }>>;
  /**
   * Key spec → action, as data (caique R2), or the name of a registered keymap (R10). Defaults
   * to the registered `default`. `ctrl+c` is `quit` unless the keymap binds it.
   */
  keymap?: Keymap | string;
  tabs?: readonly string[];
  /** Panes that take focus, in order. */
  focus?: readonly string[];
  /** Whether this run was asked for `--json`. */
  json?: boolean;
  /** Every action, after the screen's own state has taken it: the program's half of the keymap. */
  onAction?(action: string, screen: Screen): void;
}

export interface Screen {
  /** What `open()` decided, from roundel's policy. */
  readonly mode: OutputMode;
  /** Whether keys are being read: a `tty` whose stdin can go raw, and nothing else. */
  readonly interactive: boolean;
  readonly state: ScreenState;
  update(pane: string, state: unknown): void;
  /** Text above the live region, written once and never repainted (Ink's `<Static>`). */
  commit(text: string): void;
  /** Run an action as if its key had been pressed: what a static session has instead of keys. */
  dispatch(action: string): void;
  close(): void;
}

/** Where every undo registers: closeout's `restore` phase, which runs last on every exit path. */
const restore: Registrar = (handler) => onExit(handler, { phase: 'restore' });

const DEFAULT_COLUMNS = 80;
const DEFAULT_ROWS = 24;
const DEFAULT_INTERVAL = 80;
const NOTHING = (): void => undefined;

/**
 * Paint `lines` as the writer's last frame and let them go into scrollback. The empty last
 * line is the newline: `release()` writes nothing, and the next frame, or the shell prompt,
 * must start below the text rather than on top of its last line.
 */
function settle(writer: FrameWriter, lines: readonly string[]): void {
  writer.paint([...lines, '']);
  writer.release();
}

function unknownPane(name: string): never {
  throw new TypeError(`controlroom: no pane named "${name}"`);
}

export function open(rt: Runtime, given: ScreenOptions): Screen {
  // Resolved before the mode is decided, so a name nobody registered fails in a pipe exactly as
  // it fails on a terminal, not only where keys are read.
  const options: Resolved = { ...given, panes: panesOf(given), keymap: keymapOf(given) };
  const mode = outputMode(rt, { json: options.json === true });
  if (mode === 'tty' && canReadKeys(rt.stdin)) return live(rt, options);
  // ponytail: a tty whose stdin cannot go raw (`cmd < file` in a terminal) is projected
  // statically too, by telling flagstaff it is not a tty, rather than by a second policy.
  return projected(mode === 'tty' ? { ...rt, isTTY: { stdout: false } } : rt, options, mode);
}

function treeOf(options: ScreenOptions, state: ScreenState): Layout {
  const tree = typeof options.layout === 'function' ? options.layout(state) : options.layout;
  return collapse(tree, state.collapsed);
}

function keymapOf(options: ScreenOptions): Keymap {
  const { keymap = 'default' } = options;
  if (typeof keymap !== 'string') return { 'ctrl+c': 'quit', ...keymap };
  const def = registered().keymaps.get(keymap) ?? missing(`no keymap named "${keymap}" is registered`, "register a plugin with `keymaps: { … }`, or pass the keymap itself");
  return { 'ctrl+c': 'quit', ...def.keys };
}

/** A screen asked for something nobody registered: what is missing, and what to do about it. */
export class ScreenError extends TypeError {
  constructor(
    message: string,
    readonly fix: string,
  ) {
    super(`controlroom: ${message}`);
    this.name = 'ScreenError';
  }
}

function missing(message: string, fix: string): never {
  throw new ScreenError(message, fix);
}

/** The options with every registered pane resolved to its component. */
type Resolved = Omit<ScreenOptions, 'panes' | 'keymap'> & { panes: Panes; keymap: Keymap };

/** Every pane as a component and its state: a registered pane resolves to the flagstaff component it names. */
function panesOf(options: ScreenOptions): Panes {
  const components = flagstaffRegistered().components;
  const panes = registered().panes;
  return Object.fromEntries(
    Object.entries(options.panes).map(([name, entry]): [string, Pane] => {
      if (!('pane' in entry)) return [name, entry];
      const def = panes.get(entry.pane) ?? missing(`no pane named "${entry.pane}" is registered`, "register a plugin with `panes: { … }`");
      const component = components.get(def.component) ?? missing(`pane "${entry.pane}" draws with "${def.component}", which flagstaff has not registered`, 'register the plugin that provides that component before opening the screen');
      return [name, def.label === undefined ? { component, state: entry.state } : { component, state: entry.state, label: def.label }];
    }),
  );
}

/** R6 — the static session: hoisted panes, a committed log, and no keys at all. */
function projected(rt: Runtime, options: Resolved, mode: OutputMode): Screen {
  const opts = { json: options.json === true };
  let state = initial(options.tabs, options.focus);
  const hoisted = new Map<string, { pane: Pane; hoisted: Hoisted<unknown> }>();
  for (const [name, pane] of Object.entries(options.panes)) {
    if (pane.liveOnly === true) continue;
    const component: Component<unknown> = {
      name,
      static: (s) => (pane.label === undefined ? pane.component.static(s) : `${pane.label}\n${pane.component.static(s)}`),
    };
    hoisted.set(name, { pane, hoisted: hoist(component, rt, pane.state, opts) });
  }
  // Committed text appends: as a growing log in a static projection (which prints only the
  // lines it has not printed), and as one event per commit under --json.
  const committed: string[] = [];
  const log: Component<string> = { name: 'commit', static: (s) => s };
  let commits: Hoisted<string> | undefined;
  let closed = false;
  const screen: Screen = {
    mode,
    interactive: false,
    // eslint-disable-next-line maintainability/identical-functions -- each screen reads its own `state`; a getter cannot be shared by spreading, which reads it once
    get state() {
      return state;
    },
    update(name, next) {
      if (options.panes[name]?.liveOnly === true) return;
      const entry = hoisted.get(name) ?? unknownPane(name);
      entry.pane = { ...entry.pane, state: next };
      entry.hoisted.update(next);
    },
    commit(text) {
      committed.push(text);
      const value = mode === 'json' ? text : committed.join('\n');
      if (commits === undefined) commits = hoist(log, rt, value, opts);
      else commits.update(value);
    },
    dispatch(action) {
      state = reduce(state, action);
      options.onAction?.(action, screen);
    },
    close() {
      if (closed) return;
      closed = true;
      for (const { hoisted: h } of hoisted.values()) h.lower();
      commits?.lower();
    },
  };
  return screen;
}

/** R4, R5, R19 — the live screen. */
function live(rt: Runtime, options: Resolved): Screen {
  const alternate = options.screen === 'alternate';
  const panes = new Map(Object.entries(options.panes));
  const { keymap } = options;
  let state = initial(options.tabs, options.focus);
  const started = rt.clock.now();
  const committed: string[] = [];
  const undo: (() => void)[] = [];
  if (alternate) undo.push(alternateScreen(rt.stdout, restore));
  undo.push(hideCursor(rt.stdout, restore));
  let writer = frameWriter(rt.stdout);

  const frame = (animated: boolean): string[] => {
    const size = { columns: rt.stdout.columns ?? DEFAULT_COLUMNS, rows: rt.stdout.rows ?? DEFAULT_ROWS, t: rt.clock.now() - started, live: animated };
    const lines = compose(treeOf(options, state), Object.fromEntries(panes), size);
    if (alternate) return lines;
    // Inline, the live region is as tall as what it shows: blank rows under the last drawn
    // one would push the committed text up for nothing.
    // ponytail: trims trailing blank rows only; a layout that wants space below its content
    // asks for it with a fixed size.
    while (lines.length > 0 && lines.at(-1)!.trim() === '') lines.pop();
    return lines;
  };
  const paint = (): void => writer.paint(frame(true));

  const interval = Math.min(...[...panes.values()].filter((p) => p.component.frame !== undefined).map((p) => p.component.interval ?? DEFAULT_INTERVAL));
  let cancelTick = NOTHING;
  const tick = (): void => {
    paint();
    cancelTick = rt.clock.schedule(tick, interval);
  };
  if (Number.isFinite(interval)) cancelTick = rt.clock.schedule(tick, interval);

  rt.stdout.on?.('resize', paint);
  let closed = false;
  const stopKeys = readKeys(
    rt.stdin,
    (key: KeyPress) => {
      const action = match(keymap, key);
      if (action !== undefined) screen.dispatch(action);
    },
    restore,
  );

  const screen: Screen = {
    mode: 'tty',
    interactive: true,
    get state() {
      return state;
    },
    update(name, next) {
      const pane = panes.get(name) ?? unknownPane(name);
      panes.set(name, { ...pane, state: next });
      paint();
    },
    commit(text) {
      if (alternate) {
        // The alternate screen has no scrollback: committed text is kept, and handed to the
        // main screen when this one closes.
        committed.push(text);
        return;
      }
      // R19: the committed text takes the live region's place and is released into
      // scrollback; a fresh writer then paints the live region again under it.
      settle(writer, text.split('\n'));
      writer = frameWriter(rt.stdout);
      paint();
    },
    dispatch(action) {
      if (closed) return;
      state = reduce(state, action);
      if (action === 'quit') screen.close();
      else paint();
      options.onAction?.(action, screen);
    },
    close() {
      if (closed) return;
      closed = true;
      cancelTick();
      rt.stdout.off?.('resize', paint);
      stopKeys();
      if (alternate) {
        for (const leave of undo) leave();
        if (committed.length > 0) settle(frameWriter(rt.stdout), committed.join('\n').split('\n'));
        return;
      }
      // R19: the live region prints its final state once, as its static projection.
      settle(writer, frame(false));
      for (const leave of undo) leave();
    },
  };
  paint();
  return screen;
}
