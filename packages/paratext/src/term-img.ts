/**
 * `paratext/term-img` — the `term-img` surface, drop-in for the bytes it can produce.
 *
 * A subpath rather than the package root, because the root default export is already
 * `ansi-escapes`' object (R8) and `term-img`'s is a function (D-006). Graded **12 / 18**
 * against term-img's own suite, and 12 is the ceiling: the six red cases all hand a **path**
 * to a supported terminal, and D-030 says `image` takes bytes, so that `node:fs` stays out
 * of a package that otherwise touches nothing but strings. The refusal below sits at exactly
 * the line upstream calls `readFileSync`, which is what keeps the four path-to-an-unsupported-
 * terminal cases passing. The six are named in `compat-oracle/src/hosts.ts` and the whole
 * argument is in `.sdlc/intents/paratext/design.md`.
 *
 * This file carries `term-img`'s own terminal table rather than `IMAGE.when`, which also
 * requires a tty. Not to buy a case: `term-img`'s unsupported branch is `fallback()`, whose
 * default **throws**, so a tty clause here would turn every piped run into an
 * `UnsupportedTerminalError` — a drop-in taking down programs the incumbent left standing.
 * The root's `image()` keeps the clause, where the projection really is a string.
 * `term-img.test.ts` pins the divergence so a later consistency edit has to argue with it.
 */
import { IMAGE, imageFields, type ImageOptions } from './image.js';
import { processRuntime, type Runtime } from './runtime.js';
import { render } from './template.js';

/**
 * Thrown when the terminal is not believed to draw an inline image and the caller supplied
 * no `fallback`. Upstream's class, upstream's message, upstream's `name` — a caller that
 * matched on `error.name` or on `instanceof` keeps working, which is most of what drop-in
 * means for an error type.
 */
export class UnsupportedTerminalError extends Error {
  /**
   * The parameter is ours; upstream's constructor takes none. It is a superset — `new
   * UnsupportedTerminalError()` still produces upstream's exact message — and it exists so a
   * caller that knows more about *why* the terminal refused can say so.
   */
  constructor(message: string = SUPPORTED_TERMINALS) {
    super(message);
    this.name = 'UnsupportedTerminalError';
  }
}

/** `term-img`'s options: `ansi-escapes`' four, plus the escape hatch from the throw. */
export interface TerminalImageOptions extends ImageOptions {
  /** Called instead of throwing when the terminal cannot draw it. Its return value is ours. */
  fallback?: () => string;
}

function unsupported(): never {
  throw new UnsupportedTerminalError(SUPPORTED_TERMINALS);
}

/** Upstream's message, to the character — a caller matching on it keeps matching. */
const SUPPORTED_TERMINALS = 'Supported terminals:\n- iTerm2 >= v3\n- WezTerm >= v20220319\n- Konsole >= v22.04\n- Rio >= v0.1.13\n- VSCode >= v1.80\n\n';

/** Base ten, for every `parseInt` below: a terminal version is never written in hex. */
const DECIMAL = 10;
/** `major.minor.patch`, all three required. A version missing one does not compare. */
const SEMVER_PARTS = 3;
/** The five floors, from upstream's own table — the thing that rots (D-031). */
const ITERM2_MIN_MAJOR = 3;
const WEZTERM_MIN_DATE = 20_220_319;
const KONSOLE_MIN_VERSION = 220_400;
const RIO_MIN: readonly [number, number, number] = [0, 1, 13];
const VSCODE_MIN: readonly [number, number, number] = [1, 80, 0];

/** `20220319-123456-abcdefgh` → `20220319`. `NaN` for anything that is not a date stamp. */
const stamp = (version: string | undefined): number => Number.parseInt((version ?? '').split('-')[0] ?? '', DECIMAL);

/**
 * `major.minor.patch` against a minimum, upstream's comparison.
 *
 * All three parts are required on both sides — a version that does not parse is `false`,
 * never "probably fine" — which is what makes `1.79.0` and `0.1.12` the refusals their cases
 * expect.
 */
function atLeast(version: string | undefined, minimum: readonly [number, number, number]): boolean {
  const parts = (version ?? '').split('.').map((n) => Number.parseInt(n, DECIMAL));
  if (parts.length < SEMVER_PARTS || parts.some(Number.isNaN)) return false;
  const [major = 0, minor = 0, patch = 0] = parts;
  const [minMajor, minMinor, minPatch] = minimum;
  if (major !== minMajor) return major > minMajor;
  if (minor !== minMinor) return minor > minMinor;
  return patch >= minPatch;
}

/**
 * `term-img`'s own support question, from the environment alone.
 *
 * **One deliberate correction.** Upstream reads the iTerm2 major version as
 * `Number(version[0])` — the first *character* — so it would read `10.2.1` as `1` and refuse
 * a terminal five majors past its minimum. `Number.parseInt` is what it meant. Nothing in
 * the vendored suite distinguishes the two (its case is `3.3.7`), so this is a fix that
 * costs no compatibility and is written down rather than left to be re-discovered.
 *
 * Upstream reaches for `iterm2-version`, which falls back to reading the installed bundle's
 * `Info.plist` through `app-path`. It never gets there when `TERM_PROGRAM` is `iTerm.app`,
 * because that package returns `TERM_PROGRAM_VERSION` first — so an environment read is the
 * whole of the reachable behaviour, and two dependencies buy nothing.
 */
export function supportsInlineImage(runtime: Runtime): boolean {
  const program = runtime.env['TERM_PROGRAM'];
  const version = runtime.env['TERM_PROGRAM_VERSION'];
  if (program === 'iTerm.app') return Number.parseInt(version ?? '', DECIMAL) >= ITERM2_MIN_MAJOR;
  if (program === 'WezTerm') return stamp(version) >= WEZTERM_MIN_DATE;
  const konsole = runtime.env['KONSOLE_VERSION'];
  if (konsole !== undefined) return Number.parseInt(konsole, DECIMAL) >= KONSOLE_MIN_VERSION;
  if (program === 'rio') return atLeast(version, RIO_MIN);
  if (program === 'vscode') return atLeast(version, VSCODE_MIN);
  return false;
}

/** What upstream's argument accepts, including the path form this package refuses. */
export type TerminalImageInput = Uint8Array | string | null | undefined;

/**
 * `terminalImage` bound to a runtime you supply — the pure form, and what the export wraps.
 *
 * The order of the three checks is upstream's, exactly, because every one of its cases
 * depends on it: the argument is validated *before* the terminal is consulted, and the
 * terminal is consulted *before* the bytes are wanted. That is why a path handed to an
 * unsupported terminal still raises `UnsupportedTerminalError` here rather than the path
 * refusal — upstream would not have opened the file either.
 */
export function terminalImageFor(runtime: Runtime) {
  return (image?: TerminalImageInput, options: TerminalImageOptions = {}): string => {
    const fallback = typeof options.fallback === 'function' ? options.fallback : unsupported;
    if (image === undefined || image === null || image.length === 0) throw new TypeError('Image required');
    if (!supportsInlineImage(runtime)) return fallback();
    // Upstream's `fs.readFileSync(image)` is this line. See the ceiling note above.
    if (typeof image === 'string') throw new TypeError('Image must be bytes, not a path. paratext takes no `node:fs` dependency (D-030), so the caller owns the read: `terminalImage(await readFile(path))`. `term-img` accepted a path and this is the one call it made that this package will not.');
    return render(IMAGE.encode, imageFields(image, options));
  };
}

/**
 * `terminalImage(image, options?)` against the real process — `term-img`'s default export.
 */
const terminalImage = terminalImageFor(processRuntime());

// eslint-disable-next-line import-next/no-default-export -- the default IS the drop-in surface; term-img's default export is a function
export default terminalImage;
