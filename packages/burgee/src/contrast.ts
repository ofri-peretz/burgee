/**
 * Contrast, as a thing the package checks rather than a thing someone remembers.
 *
 * A burgee is a mark whose charge sits ON its own field, and whose field sits on
 * a page nobody here controls. Both of those are contrast relationships, and
 * both are easy to get wrong in a way that looks fine at 512px and fails at 24.
 * This module measures them, so `burgee brand` can refuse to emit a flag that
 * would not clear the floor and CI can hold ours to the same line.
 *
 * WCAG 2.2 sets 4.5:1 for body text and 3:1 for large text and for the parts of
 * a graphic you need in order to understand it. A logo's bars are the latter, so
 * 3:1 is the floor used here — see `AA`.
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

/** `#abc` and `#aabbcc` both parse. Anything else is a mistake worth throwing on. */
function channels(hex: string): [number, number, number] {
  const full =
    hex.length === SHORT_HEX_LENGTH
      ? `#${hex[1]!}${hex[1]!}${hex[2]!}${hex[2]!}${hex[3]!}${hex[3]!}`
      : hex;
  if (!/^#[0-9a-fA-F]{6}$/.test(full)) throw new Error(`burgee: "${hex}" is not a hex colour`);
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

/** Mix two colours in sRGB. Enough for reading a gradient stop, not for colour science. */
export function mix(a: string, b: string, t: number): string {
  const [ca, cb] = [channels(a), channels(b)];
  const hex = ca
    .map((v, i) => Math.round((v + (cb[i]! - v) * t) * SRGB_MAX))
    .map((v) => v.toString(HEX_RADIX).padStart(2, '0'))
    .join('');
  return `#${hex}`;
}

export interface ContrastFinding {
  /** What was compared, in the words someone fixing it would use. */
  what: string;
  a: string;
  b: string;
  ratio: number;
  required: number;
  passes: boolean;
}

/** Round to 2dp for reporting, without pretending to more precision than that. */
const CENTS = 100;
export function ratio(a: string, b: string): number {
  return Math.round(contrast(a, b) * CENTS) / CENTS;
}

export function check(what: string, a: string, b: string, required = AA.GRAPHIC): ContrastFinding {
  const value = ratio(a, b);
  return { what, a, b, ratio: value, required, passes: value >= required };
}

/** One line per finding, aligned, for a terminal or a failing test. */
export function report(findings: readonly ContrastFinding[]): string {
  const width = Math.max(...findings.map((f) => f.what.length));
  return findings
    .map(
      (f) =>
        `${f.passes ? 'pass' : 'FAIL'}  ${f.what.padEnd(width)}  ` +
        `${f.a} on ${f.b}  ${f.ratio.toFixed(2)}:1 (needs ${f.required}:1)`,
    )
    .join('\n');
}

/** The field colour at a point along the gradient axis, for stops given in order. */
export function fieldColorAt(stops: ReadonlyArray<{ offset: number; color: string }>, at: number): string {
  const ordered = [...stops].sort((x, y) => x.offset - y.offset);
  const first = ordered[0];
  const last = ordered.at(-1);
  if (first === undefined || last === undefined) throw new Error('burgee: a field needs at least one stop');
  if (at <= first.offset) return first.color;
  if (at >= last.offset) return last.color;
  for (let i = 1; i < ordered.length; i++) {
    const lo = ordered[i - 1]!;
    const hi = ordered[i]!;
    if (at <= hi.offset) {
      const span = hi.offset - lo.offset;
      return span === 0 ? hi.color : mix(lo.color, hi.color, (at - lo.offset) / span);
    }
  }
  return last.color;
}

/** Where the charge sits along the field axis: the flag's centre. */
const CHARGE_AT = 0.5;

export interface AuditInput {
  mark: { lead: string; follow: string };
  field: ReadonlyArray<{ offset: number; color: string }>;
  bordure?: { color: string; width: number } | ReadonlyArray<{ color: string; width: number }>;
}

/**
 * Every contrast relationship a burgee has to survive.
 *
 * Two are intrinsic — each bar against the field beneath it — and hold wherever
 * the flag is used. The rest depend on where it is placed, so pass the grounds
 * the flag will actually fly on and they are checked too. A flag that passes the
 * intrinsic pair and fails a ground has a page problem, not a logo problem.
 */
export function auditBurgee(brand: AuditInput, grounds: readonly string[] = []): ContrastFinding[] {
  const under = fieldColorAt(brand.field, CHARGE_AT);
  const findings = [
    check('leading bar on its field', brand.mark.lead, under),
    check('following bar on its field', brand.mark.follow, under),
  ];
  // The flag's own outer colours are what a page has to separate from.
  const edges = [fieldColorAt(brand.field, 0), fieldColorAt(brand.field, 1)];
  for (const ground of grounds) {
    for (const edge of edges) {
      findings.push(check(`flag edge on ${ground}`, edge, ground));
    }
  }
  return findings;
}
