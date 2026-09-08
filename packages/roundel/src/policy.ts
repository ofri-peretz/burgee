/**
 * The output policy — one answer to "where is this output going?", read from a
 * `Runtime`, never from `process` (R1, R2, R9 of `roundel`; U2 of the stack).
 *
 * Five colour libraries disagreeing about the terminal (clack #286) is what this file
 * exists to end: every package in the family asks here, and nothing else in it reads
 * `isTTY`, `NO_COLOR`, `FORCE_COLOR`, `CI` or `CLI_ACCESSIBLE`. It also holds the one
 * record `fly()` writes and every token reads, because it is the only module every
 * subpath may import (R7).
 */
/**
 * The slice of a runtime the policy needs. burgee's `processRuntime` satisfies it, so
 * does a two-line literal in a test; nothing here imports a type from anywhere.
 */
export interface Runtime {
  env: Record<string, string | undefined>;
  isTTY: { stdout: boolean };
}

export type OutputMode = 'tty' | 'pipe' | 'json' | 'accessible' | 'ci';

const MAX_LEVEL = 3;
/** chalk's levels: none, 16 colours, 256 colours, truecolor. */
export type ColorLevel = 0 | 1 | 2 | typeof MAX_LEVEL;

export interface ModeOptions {
  /** Whether this run was asked for `--json`: the engine's knowledge, not the process's. */
  json?: boolean;
}

/** Present and not empty — the NO_COLOR convention, applied to every switch here. */
function set(value: string | undefined): boolean {
  return value !== undefined && value !== '';
}

/**
 * First match wins: `json` if asked; `accessible` if `CLI_ACCESSIBLE`; `ci` if `CI` and not
 * a TTY; `pipe` if not a TTY; else `tty`.
 */
export function outputMode(rt: Runtime, opts: ModeOptions = {}): OutputMode {
  if (opts.json === true) return 'json';
  if (set(rt.env['CLI_ACCESSIBLE'])) return 'accessible';
  if (rt.isTTY.stdout) return 'tty';
  return set(rt.env['CI']) ? 'ci' : 'pipe';
}

const LEVELS: readonly ColorLevel[] = [0, 1, 2, MAX_LEVEL];
const DECIMAL = 10;

/** `FORCE_COLOR`, read as supports-color reads it: a floor on the level, `false`/`0` off. */
function forced(value: string | undefined): ColorLevel | undefined {
  if (value === undefined) return undefined;
  if (value === 'false') return 0;
  if (value === '' || value === 'true') return 1;
  const n = Number.parseInt(value, DECIMAL);
  return LEVELS[Math.min(Math.max(n, 0), MAX_LEVEL)] ?? 1;
}

const TERM_256 = /-256(color)?$/i;
const TERM_16 = /^screen|^xterm|^vt100|^vt220|^rxvt|color|ansi|cygwin|linux/i;

/**
 * chalk's level from `NO_COLOR`, `FORCE_COLOR`, `TERM` and `COLORTERM` — and `0` under
 * every mode but `tty`, which is the one place this and chalk part ways: a pipe is a pipe,
 * whatever the env says, so five components cannot each decide otherwise.
 */
export function colorLevel(rt: Runtime, opts?: ModeOptions): ColorLevel {
  if (outputMode(rt, opts) !== 'tty') return 0;
  const { NO_COLOR, FORCE_COLOR, TERM = '', COLORTERM } = rt.env;
  if (set(NO_COLOR)) return 0;
  const floor = forced(FORCE_COLOR);
  if (floor === 0) return 0;
  // ponytail: supports-color also consults the platform, TERM_PROGRAM and CI vendors; R2
  // names four variables and TTY-ness, and those are the four that are read.
  if (TERM === 'dumb') return floor ?? 0;
  if (COLORTERM === 'truecolor') return MAX_LEVEL;
  if (TERM_256.test(TERM)) return 2;
  if (TERM_16.test(TERM) || COLORTERM !== undefined) return 1;
  return floor ?? 0;
}

export type TokenName = 'error' | 'warn' | 'ok' | 'hint' | 'muted' | 'command' | 'flag' | 'value' | 'heading';

/** One `util.styleText` format name: `'bold'`, `'red'`, `'redBright'`, `'dim'`… */
// @types/node 26 types styleText's format as InspectColor | readonly InspectColor[] | `#…`;
// the named formats are the contract here (hex goes through the theme's own path).
export type Format = import('node:util').InspectColor;

/**
 * A style as a token paints it: `styleText` format names, or the SGR parameters of one
 * foreground colour (`38;5;n` for 256 colours, `38;2;r;g;b` for truecolor), which
 * `styleText` cannot express.
 */
export type Paint = readonly Format[] | { readonly sgr: readonly number[] };

/**
 * What `fly()` decided, once, for the process: the colour level and each token's paint.
 * Every token reads it; nothing writes it but `fly()`. Until then the level is 0 and every
 * token is the identity, so a program that never declares its runtime prints plain text.
 */
export const flown: { level: ColorLevel; paint: Partial<Record<TokenName, Paint>> } = { level: 0, paint: {} };
