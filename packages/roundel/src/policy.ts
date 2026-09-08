/**
 * `roundel/policy` — the one place in the family that decides what the terminal is (U2).
 *
 * Every component reads `outputMode`; none detects the terminal on its own. Colour
 * libraries that each decide for themselves disagree (clack #286); one function with one
 * answer per input is the check that would have caught that. Pure over a Runtime-shaped
 * argument: nothing here reads `process` (R9, T1).
 */

/** The slice of a Runtime the policy reads. burgee's `Runtime` satisfies it structurally. */
export interface PolicyRuntime {
  isTTY: { stdout: boolean };
  env: Record<string, string | undefined>;
}

export type OutputMode = 'tty' | 'pipe' | 'json' | 'accessible' | 'ci';

// eslint-disable-next-line conventions/no-magic-numbers -- a literal type is a set of names, not a magic number (FP 19)
export type ColorLevel = 0 | 1 | 2 | 3;

const set = (value: string | undefined): boolean => value !== undefined && value !== '';
const DECIMAL = 10;

/**
 * R1, first match wins: `json` when the caller says the run is `--json` (the engine's
 * knowledge, not the process's); `accessible` under `CLI_ACCESSIBLE`; `ci` under `CI` off a
 * terminal; `pipe` off a terminal; else `tty`.
 */
export function outputMode(rt: PolicyRuntime, opts: { json?: boolean } = {}): OutputMode {
  if (opts.json === true) return 'json';
  if (set(rt.env['CLI_ACCESSIBLE'])) return 'accessible';
  if (!rt.isTTY.stdout) return set(rt.env['CI']) ? 'ci' : 'pipe';
  return 'tty';
}

const TRUECOLOR = 3;
const ANSI_256 = 2;
const BASIC = 1;
const NONE = 0;

/** iTerm before 3 is 256-colour; 3 and later are truecolor. */
const ITERM_TRUECOLOR_FROM = 3;

/** The CI vendors chalk knows to render truecolor; every other `CI` is basic. */
const TRUECOLOR_CI = ['GITHUB_ACTIONS', 'GITEA_ACTIONS', 'CIRCLECI'];
const BASIC_CI = ['TRAVIS', 'APPVEYOR', 'GITLAB_CI', 'BUILDKITE', 'DRONE'];

function forced(value: string): ColorLevel {
  if (value === 'true' || value === '') return BASIC;
  if (value === 'false') return NONE;
  const n = Number.parseInt(value, DECIMAL);
  return Number.isNaN(n) ? BASIC : (Math.min(Math.max(n, NONE), TRUECOLOR) as ColorLevel);
}

/**
 * R2: chalk's levels from `NO_COLOR`, `FORCE_COLOR`, `TERM`, `COLORTERM` and the CI vendor,
 * and `0` under every mode but `tty` — a pipe, an agent, a CI log and a screen reader all
 * get plain text, whatever `FORCE_COLOR` says. That last clause is where this differs from
 * chalk, on purpose: it is the family's policy, not a library's default.
 */
export function colorLevel(rt: PolicyRuntime, opts: { json?: boolean } = {}): ColorLevel {
  if (outputMode(rt, opts) !== 'tty') return NONE;
  const { env } = rt;
  if (set(env['NO_COLOR'])) return NONE;
  const force = env['FORCE_COLOR'];
  if (force !== undefined) return forced(force);
  if (env['TERM'] === 'dumb') return NONE;
  if (set(env['CI'])) return ciLevel(env);
  return terminalLevel(env);
}

/** On a CI terminal the vendor decides: the ones chalk knows render truecolor or basic, the rest nothing. */
function ciLevel(env: PolicyRuntime['env']): ColorLevel {
  if (TRUECOLOR_CI.some((v) => set(env[v]))) return TRUECOLOR;
  if (BASIC_CI.some((v) => set(env[v]))) return BASIC;
  return NONE;
}

/** Off CI, what the terminal program and TERM say about themselves. */
function terminalLevel(env: PolicyRuntime['env']): ColorLevel {
  const term = env['TERM'] ?? '';
  const colorterm = env['COLORTERM'] ?? '';
  if (/^(truecolor|24bit)$/i.test(colorterm)) return TRUECOLOR;
  if (env['TERM_PROGRAM'] === 'iTerm.app') {
    const major = Number.parseInt((env['TERM_PROGRAM_VERSION'] ?? '').split('.')[0] ?? '', DECIMAL);
    return major >= ITERM_TRUECOLOR_FROM ? TRUECOLOR : ANSI_256;
  }
  if (env['TERM_PROGRAM'] === 'Apple_Terminal') return ANSI_256;
  if (/-256(color)?$/i.test(term)) return ANSI_256;
  if (/^screen|^xterm|^vt100|^vt220|^rxvt|color|ansi|cygwin|linux/i.test(term)) return BASIC;
  if (set(colorterm)) return BASIC;
  return NONE;
}
