/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * `roundel/picocolors` — the drop-in path for `picocolors` 1 (`graded-override-targets` R7).
 *
 * picocolors' surface, graded by its own suite in `compat-oracle`: `createColors`,
 * `isColorSupported`, and the forty-one style functions, with picocolors' own rules. A style
 * closes on its own close code; a close of the same code inside the text is replaced so the
 * outer style resumes (`bold` and `dim` share `22` and re-open themselves); and the input is
 * stringified the way `"" + input` does, so `pc.red()` is `red("undefined")`.
 *
 * Colour is on when picocolors would turn it on: not `NO_COLOR` or `--no-color`, and one of
 * `FORCE_COLOR`, `--color`, Windows, a stdout TTY whose `TERM` is not `dumb`, or `CI`. The
 * process is read once, at import, through `runtime.ts` — roundel's one door to it — and the
 * platform from `node:os`, which answers what `process.platform` does without a second door.
 * (`runtime.ts` itself cannot grow: `./chalk` reaches it and sits 7 B under chalk's own bytes.)
 *
 * It is not `roundel/tokens` renamed. A token closes and re-opens around every line break and
 * takes its level from `roundel/policy`, which honours `FORCE_COLOR=0`; picocolors does neither,
 * and its suite asserts exact bytes. picocolors' whole pitch is its size, so this file is held
 * at or under picocolors' bundled bytes by `scripts/subpath-weight-lock.test.ts`, and over that
 * bar it does not ship (R7).
 */
import { platform } from 'node:os';

import { processRuntime } from './runtime.js';

/** One style: the input, stringified, between an open and a close code. */
export type Formatter = (input: unknown) => string;

/** What `createColors` returns: whether colour is on, and every style. */
export type Colors = { isColorSupported: boolean } & Record<StyleName, Formatter>;

type StyleName = (typeof NAMES)[number];

const NAMES = [
  'reset', 'bold', 'dim', 'italic', 'underline', 'inverse', 'hidden', 'strikethrough',
  'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'gray',
  'bgBlack', 'bgRed', 'bgGreen', 'bgYellow', 'bgBlue', 'bgMagenta', 'bgCyan', 'bgWhite',
  'blackBright', 'redBright', 'greenBright', 'yellowBright', 'blueBright', 'magentaBright', 'cyanBright', 'whiteBright',
  'bgBlackBright', 'bgRedBright', 'bgGreenBright', 'bgYellowBright', 'bgBlueBright', 'bgMagentaBright', 'bgCyanBright', 'bgWhiteBright',
] as const;

/** Each style's open and close SGR parameter, in `NAMES` order. */
const CODES = [
  [0, 0], [1, 22], [2, 22], [3, 23], [4, 24], [7, 27], [8, 28], [9, 29],
  [30, 39], [31, 39], [32, 39], [33, 39], [34, 39], [35, 39], [36, 39], [37, 39], [90, 39],
  [40, 49], [41, 49], [42, 49], [43, 49], [44, 49], [45, 49], [46, 49], [47, 49],
  [90, 39], [91, 39], [92, 39], [93, 39], [94, 39], [95, 39], [96, 39], [97, 39],
  [100, 49], [101, 49], [102, 49], [103, 49], [104, 49], [105, 49], [106, 49], [107, 49],
] as const;

const { env, argv = [], isTTY } = processRuntime();

/** Whether picocolors would colour this process's output. */
export const isColorSupported =
  !(Boolean(env['NO_COLOR']) || argv.includes('--no-color')) &&
  (Boolean(env['FORCE_COLOR']) || argv.includes('--color') || platform() === 'win32' || (isTTY.stdout && env['TERM'] !== 'dumb') || Boolean(env['CI']));

const sgr = (code: number): string => `\u001B[${String(code)}m`;

/** The close `bold` and `dim` share, so a nested close of one re-opens the other. */
const INTENSITY_OFF = 22;

/** Every `close` in `string` from `index` on, replaced by `replace`. */
function replaceClose(string: string, close: string, replace: string, index: number): string {
  let result = '';
  let cursor = 0;
  for (let at = index; at !== -1; at = string.indexOf(close, cursor)) {
    result += string.slice(cursor, at) + replace;
    cursor = at + close.length;
  }
  return result + string.slice(cursor);
}

const formatter =
  (open: string, close: string, replace = open): Formatter =>
  (input) => {
    // `"" + input`, as picocolors writes it: a value's `valueOf` before its `toString`.
    // eslint-disable-next-line modernization/prefer-template-literal -- the incumbent's coercion, which a template literal does not reproduce for an object whose `valueOf` and `toString` disagree
    const string = '' + (input as string);
    const index = string.indexOf(close, open.length);
    return index === -1 ? open + string + close : open + replaceClose(string, close, replace, index) + close;
  };

/** The styles, coloured or not. `enabled` defaults to {@link isColorSupported}. */
export function createColors(enabled = isColorSupported): Colors {
  const colors = { isColorSupported: enabled } as Colors;
  NAMES.forEach((name, i) => {
    const [open, close] = CODES[i] as readonly [number, number];
    const replace = close === INTENSITY_OFF ? sgr(close) + sgr(open) : sgr(open);
    colors[name] = enabled ? formatter(sgr(open), sgr(close), replace) : String;
  });
  return colors;
}

/** picocolors' module: the styles for this process, and `createColors`. */
const picocolors: Colors & { createColors: typeof createColors } = { ...createColors(), createColors };

// `import pc from 'roundel/picocolors'` is the drop-in, so the entry is a default, and a
// CommonJS `require('roundel/picocolors')` gets the same object, as `require('picocolors')` does.
// Stryker disable StringLiteral: a string export name is syntax, not a value; Stryker 10 cannot place a mutant in it and aborts the whole run
// eslint-disable-next-line import-next/no-default-export -- the incumbent's entry is its module object, and it is the whole point of this file
export { picocolors as default, picocolors as 'module.exports' };
// Stryker restore StringLiteral
