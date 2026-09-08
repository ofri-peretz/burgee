/**
 * The output policy — one answer to "where is this output going?", read from a
 * `Runtime`, never from `process` (R1, R2, R9 of `roundel`; U2 of the stack).
 *
 * Five colour libraries disagreeing about the terminal (clack #286) is what this file
 * exists to end: every package in the family asks here, and nothing else in it reads
 * `isTTY`, `NO_COLOR`, `FORCE_COLOR`, `CI`, `CLI_ACCESSIBLE` or a `--color` flag. It also
 * holds the one record `fly()` writes and every token reads, because it is the only module
 * every subpath may import (R7).
 *
 * The code here is written tight — ternaries where a reader might expect statements —
 * because `./chalk` reaches this file and R8 caps that whole graph at chalk 6's own
 * 9,370 bytes. Comments are stripped from `dist`, so the prose is free; the statements
 * are not.
 */
/**
 * The slice of a runtime the policy needs. burgee's `processRuntime` satisfies it, so
 * does a two-line literal in a test; nothing here imports a type from anywhere.
 */
export interface Runtime {
  env: Record<string, string | undefined>;
  isTTY: { stdout: boolean };
  /**
   * The process arguments, when the caller owns them: `--color`, `--no-color` and
   * `--color=…` are read here and nowhere else. A test literal leaves it out.
   */
  argv?: readonly string[];
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
const set = (value: string | undefined): boolean => value !== undefined && value !== '';

/**
 * First match wins: `json` if asked; `accessible` if `CLI_ACCESSIBLE`; `ci` if `CI` and not
 * a TTY; `pipe` if not a TTY; else `tty`.
 */
// prettier-ignore — one line on purpose: tsc indents a nested ternary one step per branch,
// and those steps are bytes `./chalk` cannot spare. Same below.
export const outputMode = (rt: Runtime, opts: ModeOptions = {}): OutputMode =>
  opts.json === true ? 'json' : set(rt.env['CLI_ACCESSIBLE']) ? 'accessible' : rt.isTTY.stdout ? 'tty' : set(rt.env['CI']) ? 'ci' : 'pipe';

/**
 * An explicit colour instruction: off, an exact level, or `on` — colour at whatever level
 * the terminal reports, never below 1.
 */
type Ask = ColorLevel | 'on';

/**
 * `FORCE_COLOR` as supports-color 10 reads it: `0`/`false` off; a bare decimal an exact
 * level, clamped to 3, never a floor; `true`/empty on; anything else (`unicorn`, ` 2`,
 * `1e1`, `1.0`) unset, so it falls through to detection.
 */
const forced = (v: string | undefined): Ask | undefined =>
  v === 'false' ? 0 : v === '' || v === 'true' ? 'on' : v !== undefined && /^\d+$/.test(v) ? (Math.min(Number(v), MAX_LEVEL) as ColorLevel) : undefined;

/**
 * The `--color` flags, in the order supports-color settles them: off outranks an exact
 * level, which outranks on. Only flags before a `--` terminator count, as has-flag has it;
 * an unrecognised value (`--color=lots`) is no instruction rather than an error, because
 * the policy is not the argument parser.
 */
function flagged(argv: readonly string[]): Ask | undefined {
  const end = argv.indexOf('--');
  const seen = end < 0 ? argv : argv.slice(0, end);
  const has = (re: RegExp): boolean => seen.some((a) => re.test(a));
  return has(/^--(no-color|color=(false|never))$/) ? 0
    : has(/^--color=(16m|full|truecolor|24bit)$/) ? MAX_LEVEL
    : has(/^--color=256$/) ? 2
    : has(/^--color(=(true|always))?$/) ? 'on'
    : undefined;
}

// The CI vendors whose logs render colour, and the level each renders: supports-color 10's
// table as chalk 6.0.0 vendors it (source/vendor/supports-color/index.js), and gated as it
// gates it — on `CI` itself, and only once colour is being detected at all. Codeship is
// signalled by a value rather than a name. Azure Pipelines is not here: it is the one
// runner supports-color reads *above* its non-TTY check, so it lives in `colorLevel`.
const CI_3 = ['GITHUB_ACTIONS', 'GITEA_ACTIONS', 'CIRCLECI'];
const CI_1 = ['TRAVIS', 'APPVEYOR', 'GITLAB_CI', 'BUILDKITE', 'DRONE'];

/** What a known CI runner's log renders, or 0 off a runner nobody has vouched for. */
const ci = (env: Runtime['env']): ColorLevel =>
  CI_3.some((k) => k in env) ? MAX_LEVEL : CI_1.some((k) => k in env) || env['CI_NAME'] === 'codeship' ? 1 : 0;

const TERM_256 = /-256(color)?$/i;
const TERM_16 = /^screen|^xterm|^vt100|^vt220|^rxvt|color|ansi|cygwin|linux/i;

/** What a terminal reports of itself through `TERM` and `COLORTERM`; `dumb` is handled above. */
const terminal = ({ TERM = '', COLORTERM }: Runtime['env']): ColorLevel =>
  COLORTERM === 'truecolor' || COLORTERM === '24bit' ? MAX_LEVEL : TERM_256.test(TERM) ? 2 : TERM_16.test(TERM) || COLORTERM !== undefined ? 1 : 0;

/**
 * chalk's level, obeying the user's explicit instruction in any mode (R2 revised
 * 2026-09-08): `NO_COLOR` wins outright; then the `--color` flags in `argv`, an exact
 * `--color=256` beating a numeric `FORCE_COLOR` as chalk's own suite says; then
 * `FORCE_COLOR`. `--json` is the one output the level never enters: structured text carries
 * no escapes. The mode decides redraws (U2), never the level.
 *
 * With no instruction the order is supports-color's own, and deliberately so — chalk's
 * `level.js` asserts it, and a family that disagreed with chalk about a bare pipe would be
 * the clack #286 bug again. A pipe is 0, because a pipe nobody asked to colour is a file or
 * another program's stdin; the one exception is Azure Pipelines (`TF_BUILD` *and*
 * `AGENT_NAME` — `TF_BUILD` alone is a build without an agent), which supports-color reads
 * before it gives up on a pipe. Once colour *is* being detected — a terminal, or a run that
 * asked — `TERM=dumb` is the floor, a `CI` run is its vendor's level, and anything else is
 * what `TERM`/`COLORTERM` report. So the CI user who exports `FORCE_COLOR=true` to get
 * coloured logs gets their runner's colours, and nobody else's pipe changes.
 *
 * ponytail: supports-color also consults the platform, TEAMCITY_VERSION, TERM_PROGRAM and
 * the emulator allow-list; R2 refuses that detection, so those stay unread.
 */
export function colorLevel(rt: Runtime, opts?: ModeOptions): ColorLevel {
  const { env } = rt;
  if (opts?.json === true || set(env['NO_COLOR'])) return 0;
  const ask = flagged(rt.argv ?? []) ?? forced(env['FORCE_COLOR']);
  if (typeof ask === 'number') return ask;
  if ('TF_BUILD' in env && 'AGENT_NAME' in env) return 1;
  if (ask === undefined && !rt.isTTY.stdout) return 0;
  const min: ColorLevel = ask === undefined ? 0 : 1;
  return env['TERM'] === 'dumb' ? min : (Math.max(min, set(env['CI']) ? ci(env) : terminal(env)) as ColorLevel);
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
