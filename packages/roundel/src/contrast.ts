/**
 * The WCAG 2.2 contrast maths (R5).
 *
 * It was copied from `burgee/contrast` under Y1 — "sixty lines duplicated beats a dependency
 * arrow pointing the wrong way" — on the condition that the two copies share a test-vector
 * file. That condition was met half way for five days: this copy was pinned to
 * `contrast-vectors.json` and burgee's was not, which is the worse arrangement, because the
 * pinned copy cannot drift and the unpinned one can while keeping a green suite.
 *
 * **#194 settled it differently and better:** the arrow was reversed, so there is one
 * implementation and `burgee/contrast` imports this one. The vectors remain as a reference —
 * values computed outside this file, which is the only kind that can catch a wrong constant —
 * and `scripts/shared-vectors-lock.test.ts` keeps them read rather than kept.
 *
 * `fly()` uses it to refuse a truecolor token that would not read against the declared
 * ground. Nothing here is asked about the 16- and 256-colour palettes: those are the
 * user's terminal theme, and a number there would be invented.
 */

/** The floors WCAG 2.2 sets, as ratios. */
export const AA = {
  /** Body text against its background. */
  TEXT: 4.5,
  /** Large text, UI components, and meaningful parts of a graphic. */
  GRAPHIC: 3,
} as const;

/**
 * The stricter conformance level, for a caller who needs it: low-vision users, a CLI run on a
 * projector, a terminal in daylight, or an organisation whose accessibility policy says AAA
 * and does not care that this is a terminal.
 *
 * Not the default, and not because AA is good enough. At 7:1 the 256-colour palette runs out
 * of room fast — a great many perfectly reasonable brand colours have no readable substitute
 * in the cube at that floor — so defaulting to AAA would refuse themes that work for almost
 * everyone on almost every terminal. It is the caller's call, which is the only place that
 * judgement can honestly sit.
 */
export const AAA = {
  /** Body text against its background. */
  TEXT: 7,
  /** Large text, UI components, and meaningful parts of a graphic. */
  GRAPHIC: 4.5,
} as const;

/** Which WCAG conformance level a theme is held to. `AA` unless a caller asks for more. */
export type Conformance = 'AA' | 'AAA';

/** The floors for a conformance level, so a caller names a standard rather than a number. */
export const floors = (level: Conformance = 'AA'): typeof AA | typeof AAA => (level === 'AAA' ? AAA : AA);

const SRGB_MAX = 255;
const LINEAR_THRESHOLD = 0.03928;
const LINEAR_DIVISOR = 12.92;
const GAMMA_OFFSET = 0.055;
const GAMMA_SCALE = 1.055;
const GAMMA_EXPONENT = 2.4;
const LUMA = { r: 0.2126, g: 0.7152, b: 0.0722 } as const;
const CONTRAST_OFFSET = 0.05;
/** Byte offsets of the r, g and b pairs in `#rrggbb`. */
const RED_AT = 1;
const GREEN_AT = 3;
const BLUE_AT = 5;
const HEX_PAIRS = [RED_AT, GREEN_AT, BLUE_AT] as const;
const HEX_RADIX = 16;
const SHORT_HEX_LENGTH = 4;

/** `#abc` and `#aabbcc` both parse, to sRGB channels in 0..1. Anything else is a mistake worth throwing on. */
export function channels(hex: string): [number, number, number] {
  const full =
    hex.length === SHORT_HEX_LENGTH
      ? `#${hex[1]!}${hex[1]!}${hex[2]!}${hex[2]!}${hex[3]!}${hex[3]!}`
      : hex;
  if (!/^#[0-9a-fA-F]{6}$/.test(full)) throw new Error(`roundel: "${hex}" is not a hex colour`);
  const parsed = HEX_PAIRS.map((i) => Number.parseInt(full.slice(i, i + 2), HEX_RADIX) / SRGB_MAX);
  return parsed as [number, number, number];
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) =>
    v <= LINEAR_THRESHOLD ? v / LINEAR_DIVISOR : ((v + GAMMA_OFFSET) / GAMMA_SCALE) ** GAMMA_EXPONENT,
  ) as [number, number, number];
  return LUMA.r * r + LUMA.g * g + LUMA.b * b;
}

/** The WCAG contrast ratio between two colours. Order does not matter. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + CONTRAST_OFFSET) / (lo + CONTRAST_OFFSET);
}

/** One token's verdict at one colour level, in the words somebody fixing it would use. */
export interface ThemeFinding {
  /** The token name — `error`, `ok`, `command`. */
  token: string;
  /** `truecolor` or `256`. Never `16`: those values are the user's terminal theme. */
  at: 'truecolor' | '256';
  /** What the terminal is actually sent at this level, which is not always the hex written. */
  colour: string;
  ground: string;
  ratio: number;
  required: number;
  passes: boolean;
}

/**
 * Round to 2dp for reporting. Enough to act on, and not a claim to more precision than a
 * contrast ratio over eight-bit channels has.
 */
const CENTS = 100;
export const round2 = (value: number): number => Math.round(value * CENTS) / CENTS;

/**
 * One line per finding, aligned, for a terminal or a failing test. Mirrors
 * `burgee/contrast`'s `report` — the same shape in both packages, because somebody reading a
 * theme audit and a brand audit on the same day should not have to learn two layouts.
 *
 * Passing rows are printed too. A report that lists only failures cannot tell "nothing is
 * wrong" from "nothing was checked", and the second is the state this package was in for the
 * 256-colour level until 2026-09-13.
 */
export function reportTheme(findings: readonly ThemeFinding[]): string {
  if (findings.length === 0) return "no hex tokens to check — every token is a format name, and those are the terminal's own colours";
  const token = Math.max(...findings.map((f) => f.token.length));
  const at = Math.max(...findings.map((f) => f.at.length));
  return findings
    .map(
      (f) =>
        `${f.passes ? 'pass' : 'FAIL'}  ${f.token.padEnd(token)}  ${f.at.padEnd(at)}  ` +
        `${f.colour} on ${f.ground}  ${f.ratio.toFixed(2)}:1 (needs ${f.required}:1)`,
    )
    .join('\n');
}
