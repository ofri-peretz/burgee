/**
 * `paratext/link` — OSC 8, and nothing else.
 *
 * **Why this subpath exists.** `burgee`'s `--help` wanted a real hyperlink on a supporting
 * terminal and `Docs (https://x.dev)` on a pipe, and could not take the dependency: `help.ts`
 * is imported *statically* by `execute.ts`, so anything help reaches is in the cold-start
 * graph of `burgee foo --json` too, and paratext published nothing narrower than its 17,574 B
 * root, which runs `registerBuiltins()` at import. This entry is 2,337 B and registers
 * nothing — there is no registry in its graph. See design.md R13.
 *
 * **What it gives up, said plainly.** `link()` here reads {@link LINK} directly, so a caller
 * who corrected our guess by re-registering `link` on the global registry does not change
 * what this returns — that registry is the thing this module deliberately does not load. A
 * host that wants the registry's answer imports `paratext` and calls `emit(runtime, 'link',
 * …)`. The record itself is shared: `builtins.ts` re-exports it as `link`, so the capability
 * the registry ships and the one this subpath emits are one object, not two that drift.
 *
 * `weight.test.ts` pins the reachability and the budget; `link.test.ts` pins the bytes and
 * the absent side effect.
 */
import { type Capability } from './capability.js';
import { processRuntime, type Runtime } from './runtime.js';
import { supports } from './supports.js';
import { render } from './template.js';

const BEL = '';
const OSC = ']';

/**
 * OSC 8 — a hyperlink. The widest support in this layer, and unusually semi-detectable: VTE
 * publishes its version and Windows Terminal sets a session variable.
 *
 * The fallback is `text (url)`, not bare text: a link whose destination vanishes in a pipe
 * has lost the half that mattered. The optional group makes a link with no url just its text.
 */
export const LINK: Capability = {
  name: 'link',
  osc: 8,
  when: { tty: true, termProgram: ['iTerm.app', 'WezTerm', 'ghostty', 'vscode', 'Hyper', 'Apple_Terminal'], envAny: ['VTE_VERSION', 'WT_SESSION'] },
  encode: `${OSC}8;;{url}${BEL}{text}${OSC}8;;${BEL}`,
  fallback: '{text}[ ({url})]',
};

/**
 * Whether `runtime` is believed to render OSC 8.
 *
 * For a renderer deciding *layout* rather than bytes — a help screen that prints a `Docs`
 * column only where the URL will not be repeated in parentheses. A caller that only wants
 * the string does not need this: {@link linkFor} already answers it. The guess itself is
 * `LINK.when`, and it is data a caller may replace.
 */
export const supportsLink = (runtime: Runtime): boolean => supports(runtime, LINK);

/**
 * `link(text, url)` bound to a runtime you supply — the form a host should use. `burgee`'s
 * help renderer already carries a `Runtime`, and taking it as an argument means the whole
 * path is pure: a test is a two-line literal, and rendering help for somebody else's
 * terminal is the same call.
 */
export const linkFor =
  (runtime: Runtime) =>
  (text: string, url: string): string =>
    render(supports(runtime, LINK) ? LINK.encode : LINK.fallback, { text, url });

/**
 * `link(text, url)` against the real process — the `ansi-escapes` and `terminal-link` shape,
 * for a caller with no `Runtime` of its own. The OSC 8 sequence where the terminal is
 * believed to understand it, `Docs (https://x.dev)` everywhere else; never raw OSC into a
 * pipe, never a bare `Docs` with the destination silently dropped.
 */
export const link = (text: string, url: string): string => linkFor(processRuntime())(text, url);
