/**
 * `roundel/tokens` — the nine semantic styles over `util.styleText` (R3). A token is a
 * function `(s) => string` that returns `s` unchanged when the policy says no colour, and
 * nothing else in the package touches ANSI. `error`, not `red`: colour applied to a
 * meaning at render time, never to data (yargs #1699), so a theme changes them together.
 */
import { styleText } from 'node:util';

import { channels } from './contrast.js';
import { type ColorLevel, colorLevel, type PolicyRuntime } from './policy.js';
import { currentTheme, type Theme, type Token, TOKENS, type TokenStyle } from './theme.js';

export type Style = (s: string) => string;

export type Tokens = Record<Token, Style>;

const identity: Style = (s) => s;

const TRUECOLOR = 3;
const ANSI_256 = 2;
const ESC = '\u001B[';
const FG_RESET = `${ESC}39m`;
const SRGB_MAX = 255;
/** The 6×6×6 colour cube starts at index 16 and steps in 51s. */
const CUBE_BASE = 16;
const CUBE_STEPS = 5;
const CUBE_SIDE = 6;
/** The eight basic colours as styleText names, indexed by the rgb bits that best match them. */
const BASIC: readonly string[] = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];
const HALF = 0.5;
const GREEN_BIT = 2;
const BLUE_BIT = 4;
/** The policy decided already (U2); styleText must not second-guess it against a stream it was never given. */
const STYLE = { validateStream: false } as const;

/** styleText's own format names, applied in order. */
function formats(style: readonly string[]): Style {
  const list = [...style] as Parameters<typeof styleText>[0];
  return (s) => styleText(list, s, STYLE);
}

function rgb(hex: string): [number, number, number] {
  return channels(hex).map((v) => Math.round(v * SRGB_MAX)) as [number, number, number];
}

/** Nearest cube index in the 256-colour palette. */
function cube(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => Math.round(v * CUBE_STEPS)) as [number, number, number];
  return CUBE_BASE + CUBE_SIDE * CUBE_SIDE * r + CUBE_SIDE * g + b;
}

/** Nearest of the eight basic colours: each channel rounds to on or off. */
function basic(hex: string): string {
  const [r, g, b] = channels(hex).map((v) => (v >= HALF ? 1 : 0)) as [number, number, number];
  return BASIC[r + g * GREEN_BIT + b * BLUE_BIT] ?? 'white';
}

function paint(style: TokenStyle, level: ColorLevel): Style {
  if (typeof style !== 'string') return formats(style);
  if (level >= TRUECOLOR) {
    const [r, g, b] = rgb(style);
    return (s) => `${ESC}38;2;${r};${g};${b}m${s}${FG_RESET}`;
  }
  if (level === ANSI_256) {
    const index = cube(style);
    return (s) => `${ESC}38;5;${index}m${s}${FG_RESET}`;
  }
  return formats([basic(style)]);
}

/**
 * The tokens for this runtime: styled at the level the policy allows, identity at 0 —
 * a pipe, an agent, a CI log and a screen reader all get the plain string (R3).
 */
export function createTokens(rt: PolicyRuntime, opts: { json?: boolean; theme?: Theme } = {}): Tokens {
  const level = colorLevel(rt, opts);
  const theme = opts.theme ?? currentTheme();
  return Object.fromEntries(TOKENS.map((name) => [name, level === 0 ? identity : paint(theme[name], level)])) as Tokens;
}

/** Tokens that never style: what every mode but `tty` gets, and a safe default for a library. */
export const PLAIN: Tokens = Object.fromEntries(TOKENS.map((t) => [t, identity])) as Tokens;

export type { Token } from './theme.js';
