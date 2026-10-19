/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * `roundel/supports-color` — the drop-in path for `supports-color` 11 (`supports-color-drop-in`).
 *
 * supports-color's surface, graded by its own `test.js` in `compat-oracle`: the default
 * `{ stdout, stderr }`, decided at import, and `createSupportsColor(stream, options)`, each
 * `false` or `{ level, hasBasic, has256, has16m }`. The order is supports-color's, case for case,
 * including the two places it differs from `roundel/policy` on purpose (R3):
 *
 * - **A numeric `FORCE_COLOR` beats `--no-color`.** supports-color overwrites its flag answer with
 *   a set `FORCE_COLOR`, so `--no-color` with `FORCE_COLOR=3` is level 3 here. `roundel/policy`
 *   answers 0: a user who typed `--no-color` gets no colour from the family's own surfaces.
 * - **`NO_COLOR` and `CLI_ACCESSIBLE` are not read**, because supports-color does not read them.
 *
 * It also reads what `roundel/policy` refuses to: the platform and Windows build, TeamCity,
 * `TERM_PROGRAM` and the truecolor terminals. It is not built on `policy.ts` for that reason, and
 * because `./chalk` reaches `policy.ts` with 9 B to spare.
 *
 * supports-color's module state is kept too. `--no-color` and `--color` are read from `argv` once,
 * at import, and a call that sees `FORCE_COLOR` set writes it over that answer for every later
 * call; the `--color=256` family is read on each call. The environment object is the one the
 * process held at import, and `argv` and the platform are read on each call, all as supports-color
 * reads them, through `runtime.ts`, roundel's one door to the process.
 */
import os from 'node:os';
import tty, { type WriteStream } from 'node:tty';

import { proc } from './runtime.js';

/** `0` no colour, `1` the basic 16, `2` ANSI 256, `3` truecolor. */
export type ColorSupportLevel = 0 | 1 | 2 | 3;

/** A level and what it implies. */
export interface ColorSupport {
  level: ColorSupportLevel;
  hasBasic: boolean;
  has256: boolean;
  has16m: boolean;
}

/** `false` when the stream gets no colour. */
export type ColorInfo = ColorSupport | false;

export interface Options {
  /** Whether `process.argv` is sniffed for `--color` and `--no-color` flags. Default `true`. */
  readonly sniffFlags?: boolean;
  /** The stream's TTY-ness, when it is not the stream's own `isTTY`. */
  readonly streamIsTTY?: boolean | undefined;
}

const argv = (): readonly string[] => proc?.argv ?? [];

/** has-flag: `--<flag>`, before any `--` terminator. */
function hasFlag(flag: string): boolean {
  const args = argv();
  const position = args.indexOf(`--${flag}`);
  const terminator = args.indexOf('--');
  return position !== -1 && (terminator === -1 || position < terminator);
}

const any = (flags: string[]): boolean => flags.some(hasFlag);

/** The flags' answer, read once as supports-color reads it, and overwritten by a set `FORCE_COLOR`. */
let flagForceColor: ColorSupportLevel | undefined = any(['no-color', 'no-colors', 'color=false', 'color=never'])
  ? 0
  : any(['color', 'colors', 'color=true', 'color=always'])
    ? 1
    : undefined;

const DIGITS = /^\d+$/;

/** The environment object, held from import as supports-color holds it; its values are read per call. */
const env = proc?.env ?? {};

/** `FORCE_COLOR`: `true` and empty on, `false` off, a decimal an exact level up to 3, anything else unset. */
function envForceColor(value: string | undefined): ColorSupportLevel | undefined {
  if (value === undefined) return undefined;
  if (value === 'true' || value === '') return 1;
  if (value === 'false') return 0;
  return DIGITS.test(value) ? (Math.min(Number(value), 3) as ColorSupportLevel) : undefined;
}

const has = (keys: string[]): boolean => keys.some((key) => key in env);

function level(haveStream: boolean, streamIsTTY: boolean | undefined, sniffFlags: boolean): ColorSupportLevel {
  const noFlagForceColor = envForceColor(env['FORCE_COLOR']);
  if (noFlagForceColor !== undefined) flagForceColor = noFlagForceColor;
  const forceColor = sniffFlags ? flagForceColor : noFlagForceColor;
  if (forceColor === 0) return 0;
  if (sniffFlags) {
    if (any(['color=16m', 'color=full', 'color=truecolor'])) return 3;
    if (hasFlag('color=256')) return 2;
  }
  // A numeric `FORCE_COLOR` is an exact level; `true` and empty only turn detection on.
  if (forceColor !== undefined && DIGITS.test(env['FORCE_COLOR'] ?? '')) return forceColor;
  // Azure Pipelines, the one runner read above the non-TTY check.
  if ('TF_BUILD' in env && 'AGENT_NAME' in env) return 1;
  if (haveStream && !streamIsTTY && forceColor === undefined) return 0;
  const min = forceColor ?? 0;
  // supports-color tests `TERM` with a regular expression, which reads an unset one as "undefined".
  const term = String(env['TERM']);
  if (term === 'dumb') return min;
  if (proc?.platform === 'win32') {
    // Windows 10 build 10586 is the first with 256 colours, and build 14931 the first with truecolor.
    const [major, , build] = os.release().split('.');
    return Number(major) >= 10 && Number(build) >= 10_586 ? (Number(build) >= 14_931 ? 3 : 2) : 1;
  }
  if ('CI' in env) return has(['GITHUB_ACTIONS', 'GITEA_ACTIONS', 'CIRCLECI']) ? 3 : has(['TRAVIS', 'APPVEYOR', 'GITLAB_CI', 'BUILDKITE', 'DRONE']) || env['CI_NAME'] === 'codeship' ? 1 : min;
  if ('TEAMCITY_VERSION' in env) return /^(?:9\.0*[1-9]\d*\.|\d{2,}\.)/.test(String(env['TEAMCITY_VERSION'])) ? 1 : 0;
  if (env['COLORTERM'] === 'truecolor' || ['xterm-kitty', 'xterm-ghostty', 'wezterm'].includes(term)) return 3;
  if (env['TERM_PROGRAM'] === 'iTerm.app') return Number((env['TERM_PROGRAM_VERSION'] ?? '').split('.', 1)[0]) >= 3 ? 3 : 2;
  if (env['TERM_PROGRAM'] === 'Apple_Terminal' || /-256(?:color)?$/i.test(term)) return 2;
  if (/^screen|^xterm|^vt100|^vt220|^rxvt|color|ansi|cygwin|linux/i.test(term) || 'COLORTERM' in env) return 1;
  return min;
}

/** The colour support of `stream`, or of no stream in particular when it is left out. */
export function createSupportsColor(stream?: Pick<WriteStream, 'isTTY'>, options: Options = {}): ColorInfo {
  // Spread as supports-color spreads it: an own `streamIsTTY`, even an undefined one, beats the stream's.
  const { streamIsTTY, sniffFlags = true } = { streamIsTTY: stream?.isTTY, ...options };
  const found = level(Boolean(stream), streamIsTTY, sniffFlags);
  return found !== 0 && { level: found, hasBasic: true, has256: found >= 2, has16m: found >= 3 };
}

/** supports-color's module: stdout's and stderr's support, decided at import. */
const supportsColor: { stdout: ColorInfo; stderr: ColorInfo } = {
  stdout: createSupportsColor({ isTTY: tty.isatty(1) }),
  stderr: createSupportsColor({ isTTY: tty.isatty(2) }),
};

export default supportsColor;
