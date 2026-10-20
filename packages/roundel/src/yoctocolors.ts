/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * `roundel/yoctocolors` — the drop-in path for `yoctocolors` 2 (`colour-facades` R3).
 *
 * yoctocolors 2.2.0's surface, graded by its own `test.js` in `compat-oracle`: the 61 style
 * functions as named exports, and the same functions as the default export's namespace. A style
 * wraps its input in its open and close codes, and a close of the same code inside the input is
 * replaced so the outer style resumes — `bold` and `dim` share `22`, so a nested close of either
 * closes and re-opens. The input is coerced the way `input + ''` does.
 *
 * Colour is yoctocolors' own rule, decided once at import: `tty.WriteStream.prototype.hasColors()`,
 * which Node answers from the environment (`FORCE_COLOR`, `NO_COLOR`, `TERM`, `CI` and the rest
 * of `getColorDepth`). It is asked of Node, not read here, so this file names no output variable
 * and does not reach `runtime.ts`; it is not `roundel/policy`'s answer, and a level of `0` is
 * the identity function, as yoctocolors' is, so `red(1)` is `1`. The optional chain is
 * yoctocolors' own, for a runtime whose `node:tty` lacks any link of it.
 *
 * It is not `roundel/picocolors` renamed: picocolors searches for a nested close only after the
 * open code's length and stringifies with colour off, and yoctocolors does neither. yoctocolors'
 * pitch is its size, so this file is held at or under yoctocolors' bundled bytes by
 * `scripts/subpath-weight-lock.test.ts`, and over that bar it does not ship.
 */
import tty from 'node:tty';

/** One style: the text between an open and a close code. */
export type Format = (string: string) => string;

const hasColors = (tty as Partial<typeof tty> | undefined)?.WriteStream?.prototype?.hasColors?.() ?? false;

const format = (open: number | string, close: number): Format => {
  if (!hasColors) return (input) => input;
  const openCode = `\u001B[${open}m`;
  const closeCode = `\u001B[${close}m`;
  // `22` closes both `bold` and `dim`, so a nested close of either re-opens the outer one.
  const replace = (close === 22 ? closeCode : '') + openCode;
  // `input + ''`, as yoctocolors writes it: a value's `valueOf` before its `toString`. Every
  // close inside the text, left to right, becomes `replace`; the replacement holds no `$`.
  // eslint-disable-next-line modernization/prefer-template-literal -- the incumbent's coercion, which a template literal does not reproduce for an object whose `valueOf` and `toString` disagree
  return (input) => openCode + (input + '').replaceAll(closeCode, replace) + closeCode;
};

export const reset = format(0, 0);
export const bold = format(1, 22);
export const dim = format(2, 22);
export const italic = format(3, 23);
export const underline = format(4, 24);
export const underlineDouble = format('4:2', 24);
export const underlineCurly = format('4:3', 24);
export const underlineDotted = format('4:4', 24);
export const underlineDashed = format('4:5', 24);
export const overline = format(53, 55);
export const inverse = format(7, 27);
export const hidden = format(8, 28);
export const strikethrough = format(9, 29);

export const black = format(30, 39);
export const red = format(31, 39);
export const green = format(32, 39);
export const yellow = format(33, 39);
export const blue = format(34, 39);
export const magenta = format(35, 39);
export const cyan = format(36, 39);
export const white = format(37, 39);
export const gray = format(90, 39);

export const bgBlack = format(40, 49);
export const bgRed = format(41, 49);
export const bgGreen = format(42, 49);
export const bgYellow = format(43, 49);
export const bgBlue = format(44, 49);
export const bgMagenta = format(45, 49);
export const bgCyan = format(46, 49);
export const bgWhite = format(47, 49);
export const bgGray = format(100, 49);

export const redBright = format(91, 39);
export const greenBright = format(92, 39);
export const yellowBright = format(93, 39);
export const blueBright = format(94, 39);
export const magentaBright = format(95, 39);
export const cyanBright = format(96, 39);
export const whiteBright = format(97, 39);

export const bgRedBright = format(101, 49);
export const bgGreenBright = format(102, 49);
export const bgYellowBright = format(103, 49);
export const bgBlueBright = format(104, 49);
export const bgMagentaBright = format(105, 49);
export const bgCyanBright = format(106, 49);
export const bgWhiteBright = format(107, 49);

// Underline colour (`SGR 58`/`59`): no 16-colour form, so the palette index, as yoctocolors writes it.
export const underlineBlack = format('58;5;0', 59);
export const underlineRed = format('58;5;1', 59);
export const underlineGreen = format('58;5;2', 59);
export const underlineYellow = format('58;5;3', 59);
export const underlineBlue = format('58;5;4', 59);
export const underlineMagenta = format('58;5;5', 59);
export const underlineCyan = format('58;5;6', 59);
export const underlineWhite = format('58;5;7', 59);
export const underlineGray = format('58;5;8', 59);

export const underlineRedBright = format('58;5;9', 59);
export const underlineGreenBright = format('58;5;10', 59);
export const underlineYellowBright = format('58;5;11', 59);
export const underlineBlueBright = format('58;5;12', 59);
export const underlineMagentaBright = format('58;5;13', 59);
export const underlineCyanBright = format('58;5;14', 59);
export const underlineWhiteBright = format('58;5;15', 59);

// `import colors from 'roundel/yoctocolors'` is yoctocolors' `export * as default`: the module's
// own namespace, so the default and the named exports are the same functions.
export * as default from './yoctocolors.js';
