/**
 * The theme `@inquirer/core` merges into every prompt, and the deep merge that does it.
 *
 * Two things here are graded and the rest is vocabulary. `makeTheme().keybindings` must pick
 * up `INQUIRER_KEYBINDINGS` (and `makeTheme({ keybindings: [] })` must override it), and
 * `usePrefix` must read `theme.spinner.interval`, `theme.spinner.frames` and the three
 * prefix states out of a caller's partial theme. So the merge has to be **deep and
 * per-key** — a shallow assign would drop the `done` prefix the moment a caller supplied
 * only `idle`, and `core.test.ts` supplies three states including one of its own invention.
 *
 * The glyphs are stated here rather than taken from a figures package: caique reaches only
 * this repository (U6), and the two characters involved are a tick and a box-drawing dash.
 * The ASCII fallbacks are the ones `figures` uses, applied under the same condition it
 * applies them — a Windows console that is neither Terminal nor VS Code.
 */
import { styleText } from 'node:util';

import { getDefaultKeybindings, type Keybinding } from './inquirer-keys.js';
import { processRuntime } from './runtime.js';

/**
 * Whether the terminal can be expected to draw the glyphs below.
 *
 * Read at import, like `figures` reads it: the answer cannot change inside a process, and a
 * per-call read would put an environment lookup inside every render. The environment comes
 * through `runtime.ts` because that is caique's declared seam onto the process (Y9).
 */
const env = processRuntime().env;

const UNICODE = process.platform !== 'win32' || env['WT_SESSION'] !== undefined || env['TERM_PROGRAM'] === 'vscode' || env['TERM'] === 'xterm-256color';

/** `figures.tick`. */
export const TICK = UNICODE ? '✔' : '√';

/**
 * `figures.line`, the box-drawing dash a `Separator` is made of.
 *
 * Not conditional, and that is not an oversight: `figures` replaces a fixed list of symbols
 * on a console without unicode, and `line` is not on it. Only `tick` above is.
 */
export const LINE = '─';

/** The lifecycle a prompt reports through `theme.prefix`. Open, so a caller may add states. */
export type Status = 'loading' | 'idle' | 'done' | (string & {});

/** The prefix a prompt draws: one string for every state, or one per state. */
export type ThemePrefix = string | Record<string, string>;

/** The spinner `usePrefix` runs while a prompt reports `loading`. */
export interface ThemeSpinner {
  interval: number;
  frames: string[];
}

/** The style functions a prompt reaches for. Named exactly as the incumbent names them. */
export interface ThemeStyle {
  answer: (text: string) => string;
  message: (text: string, status: Status) => string;
  error: (text: string) => string;
  defaultAnswer: (text: string) => string;
  help: (text: string) => string;
  highlight: (text: string) => string;
  key: (text: string) => string;
}

/** The whole theme, as a prompt sees it after `makeTheme` has merged the defaults in. */
export interface Theme {
  prefix: ThemePrefix;
  spinner: ThemeSpinner;
  keybindings: Keybinding[];
  style: ThemeStyle;
}

/** What a caller may hand `makeTheme`: any subset, nested. */
export type PartialTheme<Extension = object> = Partial<Omit<Theme, 'style' | 'spinner'>> & {
  spinner?: Partial<ThemeSpinner>;
  style?: Partial<ThemeStyle>;
} & Partial<Extension>;

const SPINNER_INTERVAL_MS = 80;

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * The incumbent's defaults, byte for byte where a byte is observable.
 *
 * `styleText` is `node:util`'s, which is the whole colour dependency: roundel owns colour
 * for caique's own widgets, and reaching for it here would put a second policy on a subpath
 * whose job is to behave like somebody else's package.
 */
export const defaultTheme: Theme = {
  prefix: { idle: styleText('blue', '?'), done: styleText('green', TICK) },
  spinner: { interval: SPINNER_INTERVAL_MS, frames: FRAMES.map((frame) => styleText('yellow', frame)) },
  keybindings: [],
  style: {
    answer: (text: string) => styleText('cyan', text),
    message: (text: string) => styleText('bold', text),
    error: (text: string) => styleText('red', `> ${text}`),
    defaultAnswer: (text: string) => styleText('dim', `(${text})`),
    help: (text: string) => styleText('dim', text),
    highlight: (text: string) => styleText('cyan', text),
    key: (text: string) => styleText('cyan', styleText('bold', `<${text}>`)),
  },
};

/** The defaults with the environment's keybindings folded in, read fresh on every call. */
export function getDefaultTheme(): Theme {
  return { ...defaultTheme, keybindings: getDefaultKeybindings() };
}

/**
 * A plain object — one whose prototype chain ends where `Object.prototype`'s does.
 *
 * The test matters: a spinner's `frames` array, a style function and a `Separator` instance
 * must each be *replaced* by a later theme rather than merged into key by key.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  let proto: object = value;
  let next = Object.getPrototypeOf(proto) as object | null;
  while (next !== null) {
    proto = next;
    next = Object.getPrototypeOf(proto) as object | null;
  }
  return Object.getPrototypeOf(value) === proto;
}

function deepMerge(...objects: Record<string, unknown>[]): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const object of objects) {
    for (const [key, value] of Object.entries(object)) {
      const previous = output[key];
      output[key] = isPlainObject(previous) && isPlainObject(value) ? deepMerge(previous, value) : value;
    }
  }
  return output;
}

/**
 * Merge any number of partial themes over the defaults, last one winning per leaf.
 *
 * `null` and `undefined` entries are dropped rather than merged, because a prompt passes
 * `config.theme` straight through and a caller who set no theme passes `undefined`.
 */
export function makeTheme<Extension = object>(...themes: readonly (PartialTheme<Extension> | undefined)[]): Theme & Extension {
  const toMerge = [getDefaultTheme(), ...themes.filter((theme) => theme != null)] as Record<string, unknown>[];
  return deepMerge(...toMerge) as Theme & Extension;
}
