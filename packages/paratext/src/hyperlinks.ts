/**
 * `supports-hyperlinks` 4.5.0's answer, and the part of `supports-color` 10.2.2 it defers to,
 * read from a {@link Runtime} rather than the process (A27).
 *
 * `paratext/terminal-link` used `LINK.when`, paratext's own guess, and it disagreed with the
 * incumbent in ordinary terminals: no version floors (so iTerm2 2.x and VTE 0.50.0, which
 * segfaults on OSC 8, got links), a yes for Hyper and Terminal.app, and no reading of
 * `FORCE_HYPERLINK`, `--no-hyperlink`, `CI` or win32. A drop-in that links where the
 * incumbent printed `text url` changes a migrated program's output. So the façade carries
 * the incumbent's table, as `paratext/term-img` carries `term-img`'s, and
 * `hyperlinks.test.ts` grades it case by case against the real package.
 *
 * Not a dependency and not a peek inside another package's module object: environment
 * variables, flags and version comparisons. The root `link()` keeps `LINK.when`.
 */
import { type Runtime } from './runtime.js';

/** Base ten for every `parseInt`: a terminal version is never written in hex. */
const DECIMAL = 10;
/** `supports-color`'s highest level; `FORCE_COLOR=9` is read as 3. */
const MAX_COLOR_LEVEL = 3;
/** iTerm2 3.1 is the first with OSC 8. */
const ITERM2_MAJOR = 3;
const ITERM2_MINOR = 1;
/** WezTerm versions are dates; Nix's build writes the same date as `0-unstable-YYYY-MM-DD`. */
const WEZTERM_MIN = 20_200_620;
const WEZTERM_MIN_NIX = '2020-06-20';
const NIX_WEZTERM = /^0-unstable-\d{4}-\d{2}-\d{2}$/;
/** VS Code 1.72. */
const VSCODE_MAJOR = 1;
const VSCODE_MINOR = 72;
/** VTE 0.50 — except 0.50.0 itself, which was meant to support OSC 8 and segfaults instead. */
const VTE_MIN_MINOR = 50;
const BROKEN_VTE = '0.50.0';

const NO_LINK_FLAGS = ['no-hyperlink', 'no-hyperlinks', 'hyperlink=false', 'hyperlink=never'];
const LINK_FLAGS = ['hyperlink=true', 'hyperlink=always'];
const NO_COLOR_FLAGS = ['no-color', 'no-colors', 'color=false', 'color=never'];
const COLOR_FLAGS = ['color', 'colors', 'color=true', 'color=always'];
const DEEP_COLOR_FLAGS = ['color=16m', 'color=full', 'color=truecolor', 'color=256'];
const COLOR_CI = ['GITHUB_ACTIONS', 'GITEA_ACTIONS', 'CIRCLECI', 'TRAVIS', 'APPVEYOR', 'GITLAB_CI', 'BUILDKITE', 'DRONE'];
const TEAMCITY_COLOR = /^(9\.(0*[1-9]\d*)\.|\d{2,}\.)/;
const TRUECOLOR_TERMS = ['xterm-kitty', 'xterm-ghostty', 'wezterm'];
const COLOR_PROGRAMS = ['iTerm.app', 'Apple_Terminal'];
const COLOR_TERMS = [/-256(color)?$/i, /^screen|^xterm|^vt100|^vt220|^rxvt|color|ansi|cygwin|linux/i];
const LINK_PROGRAMS = ['ghostty', 'zed', 'Orca'];
const LINK_TERMS = ['alacritty', 'xterm-kitty'];

type Env = Runtime['env'];
/** Present at all — upstream's `'X' in env`. */
const has = (env: Env, name: string): boolean => env[name] !== undefined;
/** Present and non-empty — upstream's `if (X)`. */
const set = (value: string | undefined): value is string => value !== undefined && value !== '';

/** `has-flag`, as both incumbents inline it: the flag counts only before a `--`. */
function hasFlag(argv: readonly string[], flag: string): boolean {
  let prefix = '--';
  if (flag.startsWith('-')) prefix = '';
  else if (flag.length === 1) prefix = '-';
  const at = argv.indexOf(prefix + flag);
  const end = argv.indexOf('--');
  return at !== -1 && (end === -1 || at < end);
}
const anyFlag = (argv: readonly string[], flags: readonly string[]): boolean => flags.some((f) => hasFlag(argv, f));

/** `FORCE_COLOR` first, then the flags — `supports-color`'s forced level, or undefined. */
function forcedColor(env: Env, argv: readonly string[]): number | undefined {
  const raw = env['FORCE_COLOR'];
  if (raw === 'true' || raw === '') return 1;
  if (raw === 'false') return 0;
  if (raw !== undefined) {
    const level = Math.min(Number.parseInt(raw, DECIMAL), MAX_COLOR_LEVEL);
    if (level >= 0 && level <= MAX_COLOR_LEVEL) return level;
  }
  if (anyFlag(argv, NO_COLOR_FLAGS)) return 0;
  if (anyFlag(argv, COLOR_FLAGS)) return 1;
  return undefined;
}

/** What the terminal alone says about colour; undefined is `supports-color`'s `min`, the forced level. */
function colorByTerminal(env: Env, platform: string): boolean | undefined {
  const term = env['TERM'] ?? '';
  if (term === 'dumb') return undefined;
  if (platform === 'win32') return true;
  if (has(env, 'CI')) return COLOR_CI.some((k) => has(env, k)) || env['CI_NAME'] === 'codeship' ? true : undefined;
  const teamcity = env['TEAMCITY_VERSION'];
  if (teamcity !== undefined) return TEAMCITY_COLOR.test(teamcity);
  if (env['COLORTERM'] === 'truecolor' || TRUECOLOR_TERMS.includes(term) || COLOR_PROGRAMS.includes(env['TERM_PROGRAM'] ?? '')) return true;
  if (COLOR_TERMS.some((re) => re.test(term)) || has(env, 'COLORTERM')) return true;
  return undefined;
}

/** Whether `supports-color` reports any level at all — the only thing hyperlinks asks of it. */
function hasColor(env: Env, argv: readonly string[], platform: string, isTTY: boolean): boolean {
  const force = forcedColor(env, argv);
  if (force === 0) return false;
  if (anyFlag(argv, DEEP_COLOR_FLAGS) || (has(env, 'TF_BUILD') && has(env, 'AGENT_NAME'))) return true;
  if (!isTTY && force === undefined) return false;
  return colorByTerminal(env, platform) ?? force !== undefined;
}

/** Upstream's version reader: `4601` is 46.1.0, anything else splits on dots. */
function version(text = ''): { major: number; minor: number } {
  const packed = /^\d{3,4}$/.test(text) ? /(\d{1,2})(\d{2})/.exec(text) : null;
  if (packed !== null) return { major: 0, minor: Number.parseInt(packed[1] ?? '', DECIMAL) };
  const [major = '', minor = ''] = text.split('.');
  return { major: Number.parseInt(major, DECIMAL), minor: Number.parseInt(minor, DECIMAL) };
}

const atLeast = ({ major, minor }: { major: number; minor: number }, wantMajor: number, wantMinor: number): boolean => major > wantMajor || (major === wantMajor && minor >= wantMinor);

/** Per `TERM_PROGRAM`: yes, no, or undefined to fall through to VTE and `TERM`. */
function byProgram(env: Env): boolean | undefined {
  const program = env['TERM_PROGRAM'] ?? '';
  const raw = env['TERM_PROGRAM_VERSION'] ?? '';
  if (LINK_PROGRAMS.includes(program)) return true;
  if (program === 'iTerm.app') return atLeast(version(raw), ITERM2_MAJOR, ITERM2_MINOR);
  if (program === 'WezTerm') return NIX_WEZTERM.test(raw) ? raw.slice('0-unstable-'.length) >= WEZTERM_MIN_NIX : version(raw).major >= WEZTERM_MIN;
  // Cursor forked VS Code and links in its 0.x.
  if (program === 'vscode') return set(env['CURSOR_TRACE_ID']) || atLeast(version(raw), VSCODE_MAJOR, VSCODE_MINOR);
  return undefined;
}

/** The answers that come before any terminal is consulted. */
function overridden(env: Env, argv: readonly string[]): boolean | undefined {
  const force = env['FORCE_HYPERLINK'];
  if (set(force)) return Number.parseInt(force, DECIMAL) !== 0;
  if (anyFlag(argv, NO_LINK_FLAGS)) return false;
  if (anyFlag(argv, LINK_FLAGS) || set(env['NETLIFY'])) return true;
  return undefined;
}

/** The terminal's own answer, once the environment has not already decided. */
function byTerminal(env: Env): boolean {
  const program = byProgram(env);
  if (program !== undefined) return program;
  const vte = env['VTE_VERSION'];
  if (!set(vte)) return LINK_TERMS.includes(env['TERM'] ?? '');
  // Not `atLeast`: upstream asks `major > 0 || minor >= 50`, which differs when the major is not a number.
  const { major, minor } = version(vte);
  return vte !== BROKEN_VTE && (major > 0 || minor >= VTE_MIN_MINOR);
}

/** `createSupportsHyperlinks(stream)`, for the stream `target` names. */
export function supportsHyperlinks(runtime: Runtime, target: 'stdout' | 'stderr'): boolean {
  const { env } = runtime;
  const argv = runtime.argv ?? [];
  const forced = overridden(env, argv);
  if (forced !== undefined) return forced;
  const platform = runtime.platform ?? '';
  const isTTY = target === 'stderr' ? (runtime.isTTY.stderr ?? runtime.isTTY.stdout) : runtime.isTTY.stdout;
  if (!isTTY || !hasColor(env, argv, platform, isTTY)) return false;
  if (has(env, 'WT_SESSION')) return true;
  if (platform === 'win32' || set(env['CI']) || set(env['TEAMCITY_VERSION'])) return false;
  return byTerminal(env);
}
