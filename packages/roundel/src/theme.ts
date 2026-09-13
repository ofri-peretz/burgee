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
import { channels, type Conformance, contrast, floors } from './contrast.js';
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
/**
 * A theme: a style per token, the ground the hex ones are checked against, and which WCAG
 * level to hold them to.
 *
 * `conformance` is the knob a team turns when AA is not enough — low vision, a projector, a
 * policy that says AAA. It raises the floor for **both** jobs at once: the check that refuses
 * a theme, and the search that picks the 256-colour substitute. Those two have to agree, or a
 * caller asking for AAA gets a verdict at one standard and a colour chosen at another.
 */
export type Theme = Partial<Record<TokenName, Style>> & { ground?: Hex; conformance?: Conformance };

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
const GREY_LAST = 255;
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
 * theme and entries 16–255 are not.** Exported because it is the only honest way to ask
 * "what will the terminal actually paint", which is a question a caller checking its own
 * theme has as much right to ask as `fly()` does. The 6×6×6 cube and the 24-step grey ramp are the xterm
 * values every terminal ships and none of them themes, so a contrast number over them is
 * measured rather than invented — which is exactly what `contrast.ts` says cannot be done for
 * the basic sixteen. `ansi256` never returns below 16, so every paint it produces is knowable.
 */
export function rgb256(index: number): Hex {
  const hex = (r: number, g: number, b: number): Hex => `#${[r, g, b].map((v) => v.toString(HEX_BASE).padStart(2, '0')).join('')}`;
  if (index >= GREY_START) return hex(...(Array(RGB_PARTS).fill(GREY_LOW + (index - GREY_START) * GREY_STEP) as [number, number, number]));
  const n = index - CUBE_START;
  const at = (i: number): number => CUBE_LEVELS[i] as number;
  return hex(at(Math.floor(n / CUBE_ROW)), at(Math.floor((n % CUBE_ROW) / CUBE_COL)), at(n % CUBE_COL));
}

/**
 * OKLab, for choosing *which* of the 256 entries a hex degrades to.
 *
 * Two numbers say why this is here. Per-channel rounding in gamma-encoded sRGB — which is
 * what `ansi256` does, because ansi-styles does — picks index 36 for `#0d9460` at an OKLab
 * distance of 0.0842, where entry 29 sits at 0.0409. **Half the error**, on a brand colour.
 *
 * And a third number says why OKLab alone is the wrong answer: entry 29 is **4.37:1** against
 * near-black where 36 is 7.05:1. The perceptually nearest substitute is the less readable one,
 * every time, because the cruder rounding happens to round *away* from the ground. Perceptual
 * nearness and legibility are different objectives and a terminal needs the second.
 *
 * So the search is constrained: **nearest in OKLab among the entries that still clear the
 * floor.** That beats both — closer than per-channel rounding and readable by construction,
 * rather than readable by luck. `#0d9460` lands on 65 at 0.0627 and 4.82:1.
 *
 * Not APCA, and not OKLCH lightness for the contrast verdict itself. `AA.TEXT = 4.5` is a
 * WCAG number in a published claim, and changing the formula would change which themes are
 * refused while quietly changing what the claim means. OKLab decides *which* colour; WCAG
 * decides *whether* it is allowed. A perceptual metric may narrow the choice here and may
 * never widen what `fly()` accepts.
 */
const LINEAR_THRESHOLD = 0.04045;
const LINEAR_DIVISOR = 12.92;
const GAMMA_OFFSET = 0.055;
const GAMMA_EXPONENT = 2.4;

/**
 * sRGB 0–255 to OKLab. Björn Ottosson's matrices, written as straight-line arithmetic.
 *
 * The first draft used `map`/`reduce` over two 9-element matrices, which read better and cost
 * **2,766 bytes** — `./theme` grew 44% against a 6,300-byte budget, on a package whose whole
 * claim is that each subpath is at or under the incumbent it replaces. Eighteen multiplies
 * written out are a third of that. The matrices are not data anyone configures, so making them
 * data bought nothing and charged for it.
 *
 * Exported so the coefficients are pinnable. They were not, at first: nudging the first one
 * from 0.4122214708 to 0.4022214708 left all 253 tests green, because everything downstream
 * computed distance with the *same* corrupted matrix and the palette is coarse enough to
 * absorb the error. A transform can only be checked against numbers from outside it, so
 * `theme.test.ts` holds it to the five published reference values.
 */
export function toOklab(r: number, g: number, b: number): [number, number, number] {
  const lin = (v: number): number => {
    const c = v / SRGB_MAX;
    return c <= LINEAR_THRESHOLD ? c / LINEAR_DIVISOR : ((c + GAMMA_OFFSET) / (1 + GAMMA_OFFSET)) ** GAMMA_EXPONENT;
  };
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793_617_785 * m - 0.004_072_046_8 * s,
    1.9779984951 * l - 2.428_592_205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808_675_766 * s,
  ];
}

/**
 * The 256-palette entry to degrade to: nearest in OKLab among those that clear the floor on
 * this ground, falling back to `ansi256`'s per-channel answer when none does.
 *
 * The fallback matters. On a mid-grey ground almost nothing clears 4.5:1, and a search with no
 * candidates must not return an arbitrary entry — it returns what this function has always
 * returned, and `fly()`'s check then refuses the theme, which is the honest failure.
 */
function degrade(r: number, g: number, b: number, ground: Hex, floor: number): number {
  const plain = ansi256(r, g, b);
  const target = toOklab(r, g, b);
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = CUBE_START; index <= GREY_LAST; index++) {
    const candidate = rgb256(index);
    if (contrast(candidate, ground) < floor) continue;
    const [cr, cg, cb] = channels(candidate).map((v) => Math.round(v * SRGB_MAX)) as [number, number, number];
    const [cl, ca, cb2] = toOklab(cr, cg, cb);
    const distance = (target[0] - cl) ** 2 + (target[1] - ca) ** 2 + (target[2] - cb2) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }
  return best === -1 ? plain : best;
}

/** A style as the token will paint it at this level: hex becomes truecolor, 256 or 16. */
function resolve(style: Style, level: ColorLevel, ground: Hex, floor: number): Paint {
  if (typeof style !== 'string') return style;
  const [r, g, b] = channels(style).map((v) => Math.round(v * SRGB_MAX)) as [number, number, number];
  if (level === TRUECOLOR) return { sgr: [SGR_FG, SGR_RGB, r, g, b] };
  // `degrade`, not `ansi256`: nearest in OKLab among the entries that still read on this
  // ground. `ansi16` keeps its per-channel rounding, because there is no ground-relative
  // choice to make over sixteen colours whose values belong to the user.
  return level === COLORS_256 ? { sgr: [SGR_FG, SGR_256, degrade(r, g, b, ground, floor)] } : [ansi16(r, g, b)];
}

/**
 * Fly the theme: decide the colour level from the runtime once, check every hex token
 * against the ground, and set what the tokens paint from now on. Call it at startup, with
 * `{ json }` when the run was asked for `--json`; a later call replaces the theme.
 */
export function fly(theme: Theme, rt: Runtime, opts?: ModeOptions): void {
  const level = colorLevel(rt, opts);
  const ground = theme.ground ?? INK;
  // One floor, read once, used by the check and by the search. See `Theme.conformance`.
  const floor = floors(theme.conformance).TEXT;
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
      return ratio < floor ? ratio : undefined;
    };
    // The truecolor wording is unchanged on purpose: `theme.test.ts` pins it, and a lock that
    // has to be edited to add a check is a lock that teaches you to edit locks.
    const truecolor = under(style);
    const substitute = rgb256(degrade(r, g, b, ground, floor));
    const degraded = under(substitute);
    return [
      ...(truecolor === undefined ? [] : [`${name} ${style} on ${ground} is ${truecolor.toFixed(2)}:1`]),
      ...(degraded === undefined ? [] : [`${name} ${style} at 256 colours is ${substitute} on ${ground}, ${degraded.toFixed(2)}:1`]),
    ];
  });
  if (failures.length > 0) throw new Error(`roundel: below ${floor}:1 (WCAG ${theme.conformance ?? 'AA'}) — ${failures.join('; ')}`);
  flown.level = level;
  flown.paint = Object.fromEntries(styles.map(([name, style]) => [name, resolve(style, level, ground, floor)]));
}
