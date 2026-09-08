/**
 * `roundel/theme` — one theme for a whole program, set once with `fly()` (R4). A theme
 * maps each token to a `util.styleText` format list, or to a `#rrggbb` that renders as
 * truecolor at level 3 and falls back to the nearest terminal colour below it. A truecolor
 * token that would not read against the declared ground is refused at `fly()` (R5); the
 * 16-colour palette is the user's terminal theme and is never checked or claimed.
 */
import { styleText } from 'node:util';

import { AA, contrast } from './contrast.js';

/** The policy decided already (U2); styleText must not second-guess it against a stream it was never given. */
const STYLE = { validateStream: false } as const;

export type Token = 'error' | 'warn' | 'ok' | 'hint' | 'muted' | 'command' | 'flag' | 'value' | 'heading';

export const TOKENS: readonly Token[] = ['error', 'warn', 'ok', 'hint', 'muted', 'command', 'flag', 'value', 'heading'];

/** A styleText format list (`['red', 'bold']`) or a truecolor hex (`'#b97045'`). */
export type TokenStyle = readonly string[] | string;

export type Theme = Record<Token, TokenStyle>;

/** Every terminal renders these: the defaults are formats, never hex. */
export const DEFAULT_THEME: Theme = {
  error: ['red', 'bold'],
  warn: ['yellow'],
  ok: ['green'],
  hint: ['dim'],
  muted: ['dim'],
  command: ['bold'],
  flag: ['cyan'],
  value: ['magenta'],
  heading: ['bold', 'underline'],
};

/** The ground the brand theme is checked against: burgee's dark field midpoint. */
export const DEFAULT_GROUND = '#0a0a0a';

/**
 * The burgee brand, lifted for a dark ground: rock (`#a84c17`) and juniper (`#0a6b47`)
 * each mixed 20% toward white, which is where both clear 4.5:1 on `#0a0a0a`. Errors and
 * warnings keep the terminal's own red and yellow, which every user already reads.
 */
export const BRAND_THEME: Theme = {
  error: ['red', 'bold'],
  warn: ['yellow'],
  ok: '#3b896c',
  hint: ['dim'],
  muted: '#9aada5',
  command: '#b97045',
  flag: '#3b896c',
  value: '#d4a68b',
  heading: '#b97045',
};

let current: Theme = DEFAULT_THEME;

export interface FlyOptions {
  /** The background truecolor tokens are checked against, `#0a0a0a` unless the program says otherwise. */
  ground?: string;
}

const isHex = (style: TokenStyle): style is string => typeof style === 'string';

/**
 * Set the process theme once. Unknown formats and unreadable truecolor tokens are refused
 * here, with the token named, rather than at the first render.
 */
export function fly(theme: Partial<Theme>, opts: FlyOptions = {}): Theme {
  const ground = opts.ground ?? DEFAULT_GROUND;
  const next: Theme = { ...DEFAULT_THEME, ...theme };
  for (const name of TOKENS) {
    const style = next[name];
    if (isHex(style)) {
      const ratio = contrast(style, ground);
      if (ratio < AA.TEXT) {
        throw new Error(`roundel: "${name}" (${style}) reads at ${ratio.toFixed(2)}:1 against ${ground}; AA text needs ${AA.TEXT}:1 — lift the colour, or declare the real ground with fly(theme, { ground })`);
      }
      continue;
    }
    try {
      styleText([...style] as Parameters<typeof styleText>[0], '', STYLE);
    } catch {
      throw new Error(`roundel: "${name}" names a format util.styleText does not know: ${style.join(', ')}`);
    }
  }
  current = next;
  return next;
}

/** The theme in force: what `fly()` last set, or the defaults. */
export function currentTheme(): Theme {
  return current;
}

/** Back to the defaults; tests use it, a program has no reason to. */
export function strike(): void {
  current = DEFAULT_THEME;
}
