/**
 * `paratext/terminal-link` — the `terminal-link` surface, drop-in.
 *
 * A separate subpath rather than the package root, because the root default export is
 * already `ansi-escapes`' object (R8) and `terminal-link`'s default export is a *function*.
 * One default cannot be both, which is the general case D-006 records: every façade that
 * reaches 100% in this repository targets a subpath, and every row near zero was pointed at
 * a package root presenting its own native API.
 *
 * **Detection is the incumbent's, not paratext's** (A27): `supportsHyperlinks()` in
 * `hyperlinks.ts` is `supports-hyperlinks` 4.5.0 read from a `Runtime`, graded against the real
 * package in `hyperlinks.test.ts`. `LINK.when` — the root `link()`'s guess — disagreed with it
 * in ordinary terminals, and a drop-in must link exactly where the incumbent did.
 *
 * **Two of upstream's ten cases are excluded from the grade, by exact title.** `main` and
 * `stderr` assign `supportsHyperlinks.stdout = true` on *that module object* and expect OSC 8
 * on a headless runner. paratext takes no runtime dependency (rule 2), so it cannot see the
 * assignment; it answers from the same detection the module would have computed, which on
 * that runner is no. Reading `supports-hyperlinks` when it happens to be installed would
 * turn them green and change what a caller gets based on what else is in `node_modules`.
 */
import { supportsHyperlinks } from './hyperlinks.js';
import { LINK } from './link.js';
import { commandLineRuntime, type Runtime } from './runtime.js';
import { render } from './template.js';

/** Which stream a call is bound for. Upstream's `target` option, spelled the same way. */
export type Target = 'stdout' | 'stderr';

/** Upstream's name for the options, so `import { type Options } from 'terminal-link'` migrates. */
export type Options = LinkOptions;

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

/** `terminalLink` bound to a runtime you supply — the pure form, and what the export wraps. */
export function terminalLinkFor(runtime: Runtime) {
  const call = (text: string, url: string, { target = 'stdout', ...options }: LinkOptions = {}): string => {
    if (supportsHyperlinks(runtime, target)) return render(LINK.encode, { text, url });
    if (options.fallback === false) return text;
    if (typeof options.fallback === 'function') return options.fallback(text, url);
    return `${text} ${url}`;
  };
  return call;
}

const runtime = commandLineRuntime();
const bound = terminalLinkFor(runtime);

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

const stderr = ((text: string, url: string, options: Omit<LinkOptions, 'target'> = {}) => bound(text, url, { ...options, target: 'stderr' })) as TerminalLink['stderr'];
stderr.isSupported = supportsHyperlinks(runtime, 'stderr');

const terminalLink = bound as TerminalLink;
terminalLink.isSupported = supportsHyperlinks(runtime, 'stdout');
terminalLink.stderr = stderr;

// eslint-disable-next-line import-next/no-default-export -- the default IS the drop-in surface; terminal-link's default export is a function
export default terminalLink;
