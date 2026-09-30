/**
 * The nine tokens (R3): what a program *means* — `error`, `command`, `flag` — rather than
 * the colour it happens to use. Each is `(s: string) => string` over `util.styleText`, and
 * the identity until `fly()` has decided a level above 0. This is the only file in the
 * package that emits an escape sequence.
 *
 * The identity at level 0, and the same paint at any level above it under *any* output
 * mode: the level itself obeys `NO_COLOR`, `FORCE_COLOR` and the `--color` flags in any
 * mode, and is 0 on a pipe with no instruction (R2, revised 2026-09-08). The mode decides
 * redraws, not colour, so there is no third behaviour for a token to have.
 */
import { styleText } from 'node:util';

import { flown, type Paint, type TokenName } from './policy.js';

export type Token = (s: string) => string;

const CSI = '\u001B[';

function paint(p: Paint, s: string): string {
  // `39m`: foreground back to the terminal's default, the close every colour shares.
  if ('sgr' in p) return `${CSI}${p.sgr.join(';')}m${s}${CSI}39m`;
  // validateStream off: the policy has already decided; styleText must not re-read the env.
  return styleText([...p], s, { validateStream: false });
}

/** One SGR pair as the chalk façade composes them: the parameters that open and close it, no escape. */
export interface SgrPair {
  readonly open: string;
  readonly close: string;
}

const LINE_BREAK = /\r?\n/g;

const code = (p: string): string => `${CSI}${p}m`;

/**
 * Wrap `s` in a chain of SGR pairs, outermost first, as chalk does: a close already inside
 * `s` is followed by a re-open so a nested style survives it, and every line break closes
 * before it and re-opens after (chalk/chalk#92). The façade computes parameters; the
 * escape itself is emitted here and nowhere else (R3, R6).
 */
export const sgr = (chain: readonly SgrPair[], s: string): string => painted(chain.reduce(painter, UNPAINTED), s);

/**
 * A chain's escapes, built one pair at a time as a chalk builder grows its chain: what opens it,
 * what closes it, and each pair's close and re-open, innermost first. A builder keeps its
 * painter, so a styled string costs one pass over the text rather than rebuilding every escape
 * in the chain on every call — which was most of what it cost (B5).
 */
export interface Painter {
  open: string;
  close: string;
  back: readonly (readonly [string, string])[];
}

/** No pairs: `painted` hands a string back as it came. */
export const UNPAINTED: Painter = { open: '', close: '', back: [] };

/** `at` with one more pair inside it. */
export const painter = (at: Painter, p: SgrPair): Painter => ({
  open: at.open + code(p.open),
  close: code(p.close) + at.close,
  back: [[code(p.close), code(p.open)], ...at.back],
});

/** `s` through a painter. No escape inside skips the re-open pass, no line break the line pass — chalk's own shortcut. */
export function painted({ open, close, back }: Painter, s: string): string {
  let out = s;
  if (out.includes(CSI)) for (const [shut, again] of back) if (out.includes(shut)) out = out.replaceAll(shut, shut + again);
  if (out.includes('\n')) out = out.replace(LINE_BREAK, (lf) => close + lf + open);
  return open + out + close;
}

function token(name: TokenName): Token {
  return (s) => {
    const p = flown.paint[name];
    return flown.level === 0 || p === undefined ? s : paint(p, s);
  };
}

// One statement for the nine: `./chalk` reaches this file, its whole graph is held under chalk
// 6.0.0's own source (R8), and nine declarations were 180 of the bytes a builder that keeps its
// escapes needed (B5).
export const [error, warn, ok, hint, muted, command, flag, value, heading] = (['error', 'warn', 'ok', 'hint', 'muted', 'command', 'flag', 'value', 'heading'] as const).map(token) as [Token, Token, Token, Token, Token, Token, Token, Token, Token];
