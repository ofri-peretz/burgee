/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * `roundel/colorette` — the drop-in path for `colorette` 2 (`colour-facades` R2).
 *
 * colorette 2.0.20's surface, graded by its own `tests/*.js` in `compat-oracle`: the forty-one
 * style functions as named exports, `isColorSupported`, and `createColors({ useColor })`. A style
 * wraps its input in its open and close codes, and a close of the same code inside the input is
 * replaced so the outer style resumes (`bold` and `dim` share `22`, so a nested close of either
 * closes and re-opens). `''` and `undefined` style to `''`, and every other value is coerced the
 * way `'' + input` does, so `blue(null)` is `\e[34mnull\e[39m`.
 *
 * Colour is colorette's own rule, decided once at import: off for a `NO_COLOR` that is *present*
 * (any value, empty included) or `--no-color`; otherwise on for a present `FORCE_COLOR` or
 * `--color`, on Windows unless `TERM=dumb`, when fd 1 is a terminal with a `TERM` that is not
 * `dumb`, or under `CI` on GitHub Actions, GitLab or CircleCI. The process is read through
 * `runtime.ts`, roundel's one door to it, and the terminal from `node:tty`'s `isatty(1)`, as
 * colorette asks. It is not `roundel/policy`'s answer: there an empty `NO_COLOR` is no opt-out.
 *
 * It is not `roundel/picocolors` renamed, though picocolors began as its fork: picocolors styles
 * `undefined` as `"undefined"`, starts its search for a nested close one character earlier, and
 * reads `CI` alone. With colour off every style is `String`, the same function, as colorette's
 * are, and with it on `createColors` hands back the one shared object the named exports came
 * from. colorette's pitch is its size, so this file is held at or under colorette's bundled
 * bytes by `scripts/subpath-weight-lock.test.ts`, and over that bar it does not ship.
 */
import { isatty } from 'node:tty';

import { proc } from './runtime.js';

/** One style: the text between an open and a close code. */
export type Color = (text: string | number) => string;

/** Every style, by colorette's names: what `createColors` returns. */
export interface Colorette {
  reset: Color;
  bold: Color;
  dim: Color;
  italic: Color;
  underline: Color;
  inverse: Color;
  hidden: Color;
  strikethrough: Color;
  black: Color;
  red: Color;
  green: Color;
  yellow: Color;
  blue: Color;
  magenta: Color;
  cyan: Color;
  white: Color;
  gray: Color;
  bgBlack: Color;
  bgRed: Color;
  bgGreen: Color;
  bgYellow: Color;
  bgBlue: Color;
  bgMagenta: Color;
  bgCyan: Color;
  bgWhite: Color;
  blackBright: Color;
  redBright: Color;
  greenBright: Color;
  yellowBright: Color;
  blueBright: Color;
  magentaBright: Color;
  cyanBright: Color;
  whiteBright: Color;
  bgBlackBright: Color;
  bgRedBright: Color;
  bgGreenBright: Color;
  bgYellowBright: Color;
  bgBlueBright: Color;
  bgMagentaBright: Color;
  bgCyanBright: Color;
  bgWhiteBright: Color;
}

// colorette's own fallbacks, for a runtime with no process or one missing a field.
const { env = {}, argv = [], platform = '' } = proc ?? {};
const dumb = env['TERM'] === 'dumb';

/** Whether colorette would colour this process's output. */
export const isColorSupported: boolean =
  !('NO_COLOR' in env || argv.includes('--no-color')) &&
  ('FORCE_COLOR' in env ||
    argv.includes('--color') ||
    (platform === 'win32' && !dumb) ||
    (isatty(1) && Boolean(env['TERM']) && !dumb) ||
    ('CI' in env && ('GITHUB_ACTIONS' in env || 'GITLAB_CI' in env || 'CIRCLECI' in env)));

/** The style names, in colorette's order, and each one's open code; the close follows from it. */
const NAMES = 'reset bold dim italic underline inverse hidden strikethrough black red green yellow blue magenta cyan white gray bgBlack bgRed bgGreen bgYellow bgBlue bgMagenta bgCyan bgWhite blackBright redBright greenBright yellowBright blueBright magentaBright cyanBright whiteBright bgBlackBright bgRedBright bgGreenBright bgYellowBright bgBlueBright bgMagentaBright bgCyanBright bgWhiteBright'.split(' ');
const OPEN = [0, 1, 2, 3, 4, 7, 8, 9, 30, 31, 32, 33, 34, 35, 36, 37, 90, 40, 41, 42, 43, 44, 45, 46, 47, 90, 91, 92, 93, 94, 95, 96, 97, 100, 101, 102, 103, 104, 105, 106, 107];
/** The close `bold` and `dim` share, so a nested close of either re-opens the other. */
const INTENSITY_OFF = 22;
/** The eight modifiers' closes; past them a background closes on its default and a foreground on its own. */
const MODIFIER_CLOSE = [0, 22, 22, 23, 24, 27, 28, 29];
const BACKGROUND_OFF = 49;
const FOREGROUND_OFF = 39;

const sgr = (code: number): string => `\u001B[${String(code)}m`;

const style =
  (open: string, close: string, replace: string): Color =>
  (input) => {
    if (input === '' || input === undefined) return '';
    // `'' + input`, as colorette writes it: a value's `valueOf` before its `toString`. The search
    // starts one past the open code, as colorette's does.
    // eslint-disable-next-line modernization/prefer-template-literal -- the incumbent's coercion, which a template literal does not reproduce for an object whose `valueOf` and `toString` disagree
    let at = ('' + input).indexOf(close, open.length + 1);
    if (at < 0) return open + input + close;
    // colorette cuts the input itself, not its string, so an input that is not a string throws here as it does there.
    let rest = input as string;
    let head = '';
    for (; at >= 0; at = rest.indexOf(close)) {
      head += rest.substring(0, at) + replace;
      rest = rest.substring(at + close.length);
    }
    return open + head + rest + close;
  };

/** The styles with colour on: one shared object, as colorette's is. */
// eslint-disable-next-line reliability/no-unsafe-type-narrowing -- `Object.fromEntries` cannot type its keys; they are `NAMES`, which `colorette.test.ts` holds equal to colorette's own table
const colors = Object.fromEntries(
  NAMES.map((name, i) => {
    const open = OPEN[i] as number;
    const close = MODIFIER_CLOSE[i] ?? (name.startsWith('bg') ? BACKGROUND_OFF : FOREGROUND_OFF);
    return [name, style(sgr(open), sgr(close), (close === INTENSITY_OFF ? sgr(close) : '') + sgr(open))];
  }),
) as unknown as Colorette;

/** The styles, coloured or not. `useColor` defaults to {@link isColorSupported}. */
export const createColors = ({ useColor = isColorSupported }: { useColor?: boolean } = {}): Colorette =>
  // eslint-disable-next-line reliability/no-unsafe-type-narrowing -- the same keys, `NAMES`, each `String`, as colorette's own reduce makes them
  useColor ? colors : (Object.fromEntries(NAMES.map((name) => [name, String])) as unknown as Colorette);

export const {
  reset,
  bold,
  dim,
  italic,
  underline,
  inverse,
  hidden,
  strikethrough,
  black,
  red,
  green,
  yellow,
  blue,
  magenta,
  cyan,
  white,
  gray,
  bgBlack,
  bgRed,
  bgGreen,
  bgYellow,
  bgBlue,
  bgMagenta,
  bgCyan,
  bgWhite,
  blackBright,
  redBright,
  greenBright,
  yellowBright,
  blueBright,
  magentaBright,
  cyanBright,
  whiteBright,
  bgBlackBright,
  bgRedBright,
  bgGreenBright,
  bgYellowBright,
  bgBlueBright,
  bgMagentaBright,
  bgCyanBright,
  bgWhiteBright,
} = createColors();
