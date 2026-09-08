/**
 * The WCAG 2.2 contrast maths (R5), copied from `burgee/contrast` on purpose: sixty lines
 * duplicated beats a dependency arrow pointing the wrong way (U1). This copy is held to
 * `contrast-vectors.json` by its test; burgee's test does not read that file yet, so the
 * drift lock is one-sided until the follow-up lands (burgee contrast test to read roundel's
 * contrast-vectors.json).
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
