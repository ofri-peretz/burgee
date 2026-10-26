/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * `roundel/kleur/colors` — the drop-in path for `kleur/colors` 4 (`colour-facades` R1).
 *
 * kleur 4.1.5's second entry, graded by its own `test/colors.js` in `compat-oracle`: twenty-six
 * plain functions as named exports, and `$`, whose `enabled` each of them reads on every call. A
 * function wraps its input in its open and close codes and replaces a close of the same code
 * inside it by close-then-open, so the outer style resumes; there is no chaining, so styles nest
 * by wrapping, `red(bold('x'))`. `null` and `undefined` come back as they went in, and so does
 * every input while colour is off — `red(1)` is then `1`, not `'1'` — as kleur/colors' do.
 *
 * Colour is kleur's rule, the one `roundel/kleur` keeps, decided once at import and kept on
 * `$.enabled`: off for a truthy `NODE_DISABLE_COLORS`, a `NO_COLOR` that is set at all, or
 * `TERM=dumb`; otherwise on for a `FORCE_COLOR` other than `0`, or when stdout is a terminal, or
 * where there is no process. The process is read through `runtime.ts`. Its own `$`, not
 * `roundel/kleur`'s `enabled`: the two are kleur's two modules, each with its own switch.
 *
 * Held at or under kleur/colors' bundled bytes by `scripts/subpath-weight-lock.test.ts`.
 */
import { proc } from './runtime.js';

/** One function, typed as kleur/colors declares it: a value styled, nothing and `null` returned as given. */
export interface Colorize {
  (input: string | boolean | number): string;
  (input: undefined | void): undefined;
  (input: null): null;
}

const env = proc?.env ?? {};

/** The switch every function reads: kleur's decision at import, and whatever a caller assigns after. */
export const $: { enabled: boolean } = {
  // kleur's decision, verbatim in its operands, as `roundel/kleur` keeps it.
  enabled: !env['NODE_DISABLE_COLORS'] && env['NO_COLOR'] == null && env['TERM'] !== 'dumb' && ((env['FORCE_COLOR'] != null && env['FORCE_COLOR'] !== '0') || proc === undefined || proc.stdout?.isTTY) as boolean,
};

const init = (open: number, close: number): Colorize => {
  const openCode = `\u001B[${String(open)}m`;
  const closeCode = `\u001B[${String(close)}m`;
  // `'' + txt` is what kleur/colors searches, and the input itself is what it cuts — an input that
  // is not a string throws there, as it does in kleur/colors, only when its string holds the close.
  // One expression, as kleur/colors' is: statements cost bytes against its own (R4).
  // eslint-disable-next-line modernization/prefer-template-literal -- the incumbent's coercion, which a template literal does not reproduce for an object whose `valueOf` and `toString` disagree
  return ((txt: string) => (!$.enabled || txt == null ? txt : openCode + (('' + txt).includes(closeCode) ? txt.replaceAll(closeCode, closeCode + openCode) : txt) + closeCode)) as Colorize;
};

// modifiers
export const reset = init(0, 0);
export const bold = init(1, 22);
export const dim = init(2, 22);
export const italic = init(3, 23);
export const underline = init(4, 24);
export const inverse = init(7, 27);
export const hidden = init(8, 28);
export const strikethrough = init(9, 29);

// colors
export const black = init(30, 39);
export const red = init(31, 39);
export const green = init(32, 39);
export const yellow = init(33, 39);
export const blue = init(34, 39);
export const magenta = init(35, 39);
export const cyan = init(36, 39);
export const white = init(37, 39);
export const gray = init(90, 39);
export const grey = init(90, 39);

// background colors
export const bgBlack = init(40, 49);
export const bgRed = init(41, 49);
export const bgGreen = init(42, 49);
export const bgYellow = init(43, 49);
export const bgBlue = init(44, 49);
export const bgMagenta = init(45, 49);
export const bgCyan = init(46, 49);
export const bgWhite = init(47, 49);
