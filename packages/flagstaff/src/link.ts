/**
 * The one place this package reaches OSC 8, and it does not implement it (R12).
 *
 * **Why `paratext/link` and not `paratext`.** The root entry reaches 20,221 B across ten
 * modules and calls `registerBuiltins()` at import — a side effect, in a package that declares
 * `sideEffects: false` so a bundler may drop what a program does not use. `paratext/link` is
 * **2,410 B across four modules and registers nothing**, and it carries the whole of what the
 * built-ins need: the guess (`supportsLink`), the bytes (`linkFor`) and the capability record.
 * The 17,811 B difference would land on `flagstaff/table`, whose entire budget is 4,000 B, so
 * this was not a close call — but it was measured rather than assumed, which is the rule.
 * What the narrow entry gives up is the registry: a host that re-registered `link` to correct
 * paratext's guess does not change what a box or a table emits. A program that needs that
 * imports `paratext` and calls `emit()` itself.
 *
 * **What this module is allowed to decide: nothing.** `supportsLink` is asked, never
 * re-derived — `box.ts` and `table.ts` read `live` to choose a *layout* (a url that is about
 * to be carried by an escape must not also be carried by the columns), and `paint` for the
 * bytes. Neither file names `isTTY`, `TERM`, or an escape. PRINCIPLES rule 6 is therefore
 * paratext's to keep, and `link.test.ts` checks it was kept.
 */
import { linkFor, supportsLink } from 'paratext/link';

import { processRuntime } from './runtime.js';

/**
 * The slice of the world paratext needs in order to answer. Derived from `linkFor` rather
 * than imported: `paratext/link` publishes the functions, not the type, and a second
 * specifier for a type would put `paratext` in this package's graph for something
 * `verbatimModuleSyntax` erases anyway.
 */
export type Terminal = Parameters<typeof linkFor>[0];

/**
 * The real process, narrowed to what paratext asks of it. Read through this package's own
 * seam (Y9), so `runtime.ts` stays the one file here that names the process and a caller
 * that passes its own `terminal` reaches no global at all.
 */
export const terminalRuntime = (): Terminal => {
  const runtime = processRuntime();
  return { env: runtime.env, isTTY: { stdout: runtime.stdout.isTTY === true } };
};

/**
 * The runtime a **static projection** is defined against: no terminal, so paratext renders
 * the fallback. `static()` is the text a pipe, a log, an agent and a screen reader get (R1),
 * which is the same question `linkFor` answers for a runtime that is not a terminal — so it
 * is asked rather than answered here, and `text (url)` stays a string paratext owns.
 */
export const STATIC: Terminal = { env: {}, isTTY: { stdout: false } };

export interface Painter {
  /**
   * Whether the sequence is going to be emitted — paratext's answer, for a caller deciding
   * *layout*. Off a terminal the url is content and belongs in the columns; on one it is
   * carried by an escape that measures zero.
   */
  readonly live: boolean;
  /** `(text, url) => string`. The bytes, whichever branch holds. */
  readonly paint: (text: string, url: string) => string;
}

/** Bind both questions to one runtime, once per drawing. */
export function painter(terminal?: Terminal): Painter {
  const runtime = terminal ?? terminalRuntime();
  return { live: supportsLink(runtime), paint: linkFor(runtime) };
}

/**
 * A cell or a body with a destination attached. `href` is a url or a path — `file://` for a
 * path a terminal should be able to open, which is the case R12 is named after.
 */
export interface Linked {
  readonly text: string;
  readonly href: string;
}

/** A table cell: text, or text with somewhere to go. A plain string stays a plain string. */
export type Cell = string | Linked;

export const cellText = (cell: Cell | undefined): string => (typeof cell === 'string' ? cell : (cell?.text ?? ''));
export const cellHref = (cell: Cell | undefined): string | undefined => (typeof cell === 'string' || cell === undefined ? undefined : cell.href);

/**
 * What the content reads as **before** the drawing measures it: the bare text where the
 * sequence will carry the destination, paratext's fallback where it will not. This is the
 * only consequence `live` has on layout, and it is the whole of it.
 */
export function laid(text: string, href: string | undefined, painted: Painter): string {
  if (href === undefined || href === '') return text;
  return painted.live ? text : painted.paint(text, href);
}

/**
 * The same content once it has been wrapped and is about to be padded. A line that survived
 * wrapping gets the sequence; an empty one does not, because a link around nothing is an
 * escape a terminal still has to parse and a screen reader still has to skip.
 */
export function painted(line: string, href: string | undefined, painter_: Painter): string {
  if (!painter_.live || href === undefined || href === '' || line === '') return line;
  return painter_.paint(line, href);
}
