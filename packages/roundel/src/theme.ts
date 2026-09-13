/**
 * The theme (R4, R5): one map from token to style, flown once for the whole program.
 *
 * A style is either a list of `util.styleText` format names — the user's own terminal
 * palette, never checked or claimed — or a `#rrggbb`, which is truecolor at level 3 and
 * falls back to the nearest of 256 or 16 colours below it. Every hex token is checked against
 * the declared ground at 4.5:1 before it is flown — **and so is the 256-colour entry it
 * degrades to**, at every level, so a theme that would not read on somebody's 256-colour
 * terminal fails in CI on a truecolor one. Level 1 is not checked and cannot be: the basic
 * sixteen are the user's own theme, and a ratio over them would be invented.
 */
import { AA, channels, contrast } from './contrast.js';
import {
  colorLevel,
  flown,
  type ColorLevel,
  type Format,
  type ModeOptions,
  type Paint,
  type Runtime,
  type TokenName,
} from './policy.js';

export type Hex = `#${string}`;
export type Style = Hex | readonly Format[];
/** Each token's style, and the ground the hex ones are checked against (default: near-black). */
export type Theme = Partial<Record<TokenName, Style>> & { ground?: Hex };

/** The burgee brand: deep on a light ground, lifted on a dark one — `brand-assets/`. */
const ROCK = ['#a84c17', '#f4794a'] as const;
const JUNIPER = ['#0a6b47', '#0d9460'] as const;
const INK: Hex = '#0a0a0a';

/** Whichever variant of the pair reads better on this ground. */
function brand(pair: readonly [Hex, Hex], ground: Hex): Hex {
  const [deep, lifted] = pair;
  return contrast(lifted, ground) > contrast(deep, ground) ? lifted : deep;
}

// ponytail: only error and ok carry the brand; the rest are format names, so they follow
// the user's terminal palette and need no contrast claim.
const DEFAULTS: Record<TokenName, (ground: Hex) => Style> = {
  error: (ground) => brand(ROCK, ground),
  warn: () => ['yellow'],
  ok: (ground) => brand(JUNIPER, ground),
  hint: () => ['dim'],
  muted: () => ['gray'],
  command: () => ['bold'],
  flag: () => ['cyan'],
  value: () => ['magenta'],
  heading: () => ['bold', 'underline'],
};
const TOKENS = Object.keys(DEFAULTS) as TokenName[];

// The 6x6x6 cube and the 24-step grey ramp of the 256-colour palette (xterm).
const SRGB_MAX = 255;
const CUBE_STEPS = 5;
const CUBE_START = 16;
const CUBE_ROW = 36;
const CUBE_COL = 6;
const GREY_START = 232;
const GREY_STEP = 10;
const HEX_BASE = 16;
const RGB_PARTS = 3;
/** The six sRGB values the xterm cube steps through. */
const CUBE_LEVELS = [0, 95, 135, 175, 215, 255] as const;
const GREY_STEPS = 24;
const GREY_LOW = 8;
const GREY_HIGH = 248;
const GREY_SPAN = 247;
const CUBE_WHITE = 231;
const BASIC_NAMES = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'] as const;
const BLUE_BIT = 2;
const GREEN_BIT = 1;
const SGR_FG = 38;
const SGR_256 = 5;
const SGR_RGB = 2;
const TRUECOLOR: ColorLevel = 3;
const COLORS_256: ColorLevel = 2;

/** Nearest of the 256 xterm colours, as ansi-styles computes it. */
function ansi256(r: number, g: number, b: number): number {
  if (r === g && g === b) {
    if (r < GREY_LOW) return CUBE_START;
    if (r > GREY_HIGH) return CUBE_WHITE;
    return Math.round(((r - GREY_LOW) / GREY_SPAN) * GREY_STEPS) + GREY_START;
  }
  const step = (v: number): number => Math.round((v / SRGB_MAX) * CUBE_STEPS);
  return CUBE_START + CUBE_ROW * step(r) + CUBE_COL * step(g) + step(b);
}

/**
 * Nearest of the 16 basic colours, as a `styleText` name: each channel on or off at half,
 * bright when the strongest channel sits on the top step of the cube.
 * ponytail: ansi-styles' rounding, minus its trip through the 256-colour cube.
 */
function ansi16(r: number, g: number, b: number): Format {
  const on = (v: number): number => Math.round(v / SRGB_MAX);
  const index = (on(b) << BLUE_BIT) | (on(g) << GREEN_BIT) | on(r);
  const name = BASIC_NAMES[index] ?? 'white';
  if (index === 0) return name;
  if (Math.round((Math.max(r, g, b) / SRGB_MAX) * CUBE_STEPS) !== CUBE_STEPS) return name;
  // Node spells bright black `gray`; `blackBright` is a runtime alias the types do not carry.
  return name === 'black' ? 'gray' : `${name}Bright`;
}

/**
 * The sRGB of a 256-palette index, which is `ansi256` run backwards. Defined for 16–255 only,
 * and that is the whole reason this check is possible: **entries 0–15 are the user's terminal
 * theme and entries 16–255 are not.** The 6×6×6 cube and the 24-step grey ramp are the xterm
 * values every terminal ships and none of them themes, so a contrast number over them is
 * measured rather than invented — which is exactly what `contrast.ts` says cannot be done for
 * the basic sixteen. `ansi256` never returns below 16, so every paint it produces is knowable.
 */
function rgb256(index: number): Hex {
  const hex = (r: number, g: number, b: number): Hex => `#${[r, g, b].map((v) => v.toString(HEX_BASE).padStart(2, '0')).join('')}`;
  if (index >= GREY_START) return hex(...(Array(RGB_PARTS).fill(GREY_LOW + (index - GREY_START) * GREY_STEP) as [number, number, number]));
  const n = index - CUBE_START;
  const at = (i: number): number => CUBE_LEVELS[i] as number;
  return hex(at(Math.floor(n / CUBE_ROW)), at(Math.floor((n % CUBE_ROW) / CUBE_COL)), at(n % CUBE_COL));
}

/** A style as the token will paint it at this level: hex becomes truecolor, 256 or 16. */
function resolve(style: Style, level: ColorLevel): Paint {
  if (typeof style !== 'string') return style;
  const [r, g, b] = channels(style).map((v) => Math.round(v * SRGB_MAX)) as [number, number, number];
  if (level === TRUECOLOR) return { sgr: [SGR_FG, SGR_RGB, r, g, b] };
  return level === COLORS_256 ? { sgr: [SGR_FG, SGR_256, ansi256(r, g, b)] } : [ansi16(r, g, b)];
}

/**
 * Fly the theme: decide the colour level from the runtime once, check every hex token
 * against the ground, and set what the tokens paint from now on. Call it at startup, with
 * `{ json }` when the run was asked for `--json`; a later call replaces the theme.
 */
export function fly(theme: Theme, rt: Runtime, opts?: ModeOptions): void {
  const level = colorLevel(rt, opts);
  const ground = theme.ground ?? INK;
  const styles = TOKENS.map((name) => [name, theme[name] ?? DEFAULTS[name](ground)] as const);
  const failures = styles.flatMap(([name, style]) => {
    if (typeof style !== 'string') return [];
    const [r, g, b] = channels(style).map((v) => Math.round(v * SRGB_MAX)) as [number, number, number];
    // Both colours the terminal can actually be sent, not just the one that was written.
    // Checked at every level rather than only at the level this run happens to be, so a
    // theme that fails on somebody's 256-colour terminal fails in CI on a truecolor one —
    // which is what the promise above this function has always said and did not do.
    //
    // Level 1 is absent on purpose and will stay absent: the basic sixteen are the user's
    // theme, so there is no number to check. That is a real limit of the medium, not a gap.
    const under = (value: Hex): number | undefined => {
      const ratio = contrast(value, ground);
      return ratio < AA.TEXT ? ratio : undefined;
    };
    // The truecolor wording is unchanged on purpose: `theme.test.ts` pins it, and a lock that
    // has to be edited to add a check is a lock that teaches you to edit locks.
    const truecolor = under(style);
    const substitute = rgb256(ansi256(r, g, b));
    const degraded = under(substitute);
    return [
      ...(truecolor === undefined ? [] : [`${name} ${style} on ${ground} is ${truecolor.toFixed(2)}:1`]),
      ...(degraded === undefined ? [] : [`${name} ${style} at 256 colours is ${substitute} on ${ground}, ${degraded.toFixed(2)}:1`]),
    ];
  });
  if (failures.length > 0) throw new Error(`roundel: below ${AA.TEXT}:1 — ${failures.join('; ')}`);
  flown.level = level;
  flown.paint = Object.fromEntries(styles.map(([name, style]) => [name, resolve(style, level)]));
}
