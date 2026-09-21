/**
 * `paratext/terminal-link` — the `terminal-link` surface, drop-in.
 *
 * A separate subpath rather than the package root, because the root default export is
 * already `ansi-escapes`' object (R8) and `terminal-link`'s default export is a *function*.
 * One default cannot be both, which is the general case D-006 records: every façade that
 * reaches 100% in this repository targets a subpath, and every row near zero was pointed at
 * a package root presenting its own native API.
 *
 * **Two of upstream's ten cases cannot be graded here, and the reason is not a gap.** Its
 * suite mutates `supportsHyperlinks.stdout = true` and expects the implementation to read
 * *that module object* at call time. paratext takes no runtime dependency (rule 2), so it
 * cannot see the mutation; it answers from its own detection, which on a headless runner
 * says "no hyperlinks". The six cases that set the flag to `false` therefore agree with us
 * by coincidence of environment and pass, the two `isSupported` cases only assert a boolean,
 * and `main` and `stderr` — the two that set it to `true` — get our fallback where they
 * expect OSC 8. Reading `supports-hyperlinks` when it happens to be installed would turn
 * those green and would be gaming the oracle: it would change what a real caller gets based
 * on what else is in their `node_modules`. The ceiling is 8 / 10 and it is written down.
 */
import { LINK } from './link.js';
import { processRuntime, type Runtime } from './runtime.js';
import { supports } from './supports.js';
import { render } from './template.js';

/** Which stream a call is bound for. Upstream's `target` option, spelled the same way. */
export type Target = 'stdout' | 'stderr';

export interface LinkOptions {
  target?: Target;
  /**
   * What to print when the terminal is not believed to render OSC 8.
   *
   * `false` returns the text alone, a function is called with `(text, url)`, and anything
   * else — including absent — gives upstream's `text url`, a raw URL bounded by whitespace
   * because that is what terminal linkifiers detect reliably.
   */
  fallback?: boolean | ((text: string, url: string) => string);
}

/**
 * A runtime whose `isTTY.stdout` answers for `target`, so one detection path serves both
 * streams. `stderr` falls back to `stdout` when a caller's runtime predates the field.
 */
function streamRuntime(runtime: Runtime, target: Target): Runtime {
  const tty = target === 'stderr' ? (runtime.isTTY.stderr ?? runtime.isTTY.stdout) : runtime.isTTY.stdout;
  return { ...runtime, isTTY: { ...runtime.isTTY, stdout: tty } };
}

/** `terminalLink` bound to a runtime you supply — the pure form, and what the export wraps. */
export function terminalLinkFor(runtime: Runtime) {
  const call = (text: string, url: string, { target = 'stdout', ...options }: LinkOptions = {}): string => {
    if (supports(streamRuntime(runtime, target), LINK)) return render(LINK.encode, { text, url });
    if (options.fallback === false) return text;
    if (typeof options.fallback === 'function') return options.fallback(text, url);
    return `${text} ${url}`;
  };
  return call;
}

const bound = terminalLinkFor(processRuntime());

/**
 * `terminalLink(text, url, options?)` against the real process.
 *
 * `isSupported` is a snapshot taken at import, which is upstream's shape exactly — it reads
 * `supportsHyperlinks.stdout` once at module scope. A caller who needs the live answer calls
 * the function and compares, or builds its own through {@link terminalLinkFor}.
 */
export interface TerminalLink {
  (text: string, url: string, options?: LinkOptions): string;
  isSupported: boolean;
  stderr: { (text: string, url: string, options?: Omit<LinkOptions, 'target'>): string; isSupported: boolean };
}

const runtime = processRuntime();
const stderr = ((text: string, url: string, options: Omit<LinkOptions, 'target'> = {}) => bound(text, url, { ...options, target: 'stderr' })) as TerminalLink['stderr'];
stderr.isSupported = supports(streamRuntime(runtime, 'stderr'), LINK);

const terminalLink = bound as TerminalLink;
terminalLink.isSupported = supports(streamRuntime(runtime, 'stdout'), LINK);
terminalLink.stderr = stderr;

// eslint-disable-next-line import-next/no-default-export -- the default IS the drop-in surface; terminal-link's default export is a function
export default terminalLink;
