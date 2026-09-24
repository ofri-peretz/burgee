/**
 * R8 — the `ansi-escapes` surface, all of it paratext implements.
 *
 * `ansi-escapes` is one module with two unrelated jobs in it. Most of its thirty-seven
 * members are **CSI**: move the cursor, erase a line, swap to the alternate screen. Four are
 * **OSC**: talk to the terminal *program* about a hyperlink, an image, the working directory,
 * and the bell. The OSC four are paratext's own, implemented here. The CSI half is in
 * `csi.ts`, byte-exact with the incumbent (D-138): it was declared `undefined` until
 * 2026-09-23, which kept the drop-in loading and capped its grade at 1 / 4, since three of the
 * incumbent's four cases are CSI — and so `burgee migrate` could never move a program off it.
 *
 * **The one deliberate difference, and the reason to prefer this.** `ansi-escapes` emits
 * the OSC bytes and lets the terminal sort it out; that is what puts `]1337;File=inline=1;…`
 * across the screen of anyone who piped your output to a file. Every OSC function here goes
 * through {@link emit}, so on a terminal believed to understand the sequence you get the
 * incumbent's exact bytes, and everywhere else you get the capability's static projection —
 * `Docs (https://x.dev)` for a link, the caption for an image, nothing for a `setCwd`
 * (PRINCIPLES rule 6). The CSI members do not degrade, because the incumbent's do not.
 *
 * `iTerm` and `ConEmu` are still declared and empty: each would be a capability paratext does
 * not have yet, typed {@link NotImplemented} so calling one is a compile error, not a
 * runtime `TypeError`.
 *
 * Graded by `npm run compat -- ansi-escapes`.
 */
import { registerBuiltins } from './builtins.js';
import { emit } from './capability.js';
// eslint-disable-next-line import-next/no-namespace -- the default export carries exactly csi's members, as the incumbent's carries its CSI half; listing thirty-one names twice cost 1.5 KB of the package against its weight ceiling
import * as csi from './csi.js';
import { imageFields, type ImageOptions } from './image.js';
import { processRuntime, type Runtime } from './runtime.js';

/**
 * This module's four functions are `emit()` over three built-in capabilities, so it makes
 * sure they are in the registry rather than trusting whoever imported it to have done so.
 *
 * Not defensive padding — it is the difference between a bug and a *silent* one. `emit()`
 * answers an unregistered name with whatever text the caller passed, on purpose, because
 * output is not the place to discover a typo. Reached with an empty registry, `link('Docs',
 * url)` therefore returns `Docs`: no error, no bytes, and the URL quietly gone. Registration
 * is idempotent (`register` replaces by name), so this costs nothing where the entry point
 * has already run it.
 */
registerBuiltins();

/** The bell. A byte, not a sequence — and the one member that is a value rather than a call. */
const BEL = '\u0007';


/** The members of `ansi-escapes` paratext implements, bound to one runtime. */
export interface AnsiEscapes {
  /** The bell, as a string — the incumbent's `beep`. */
  beep: string;
  /** OSC 8. Projects to `text (url)`. */
  link: (text: string, url: string) => string;
  /** OSC 1337. Projects to `options.caption`. */
  image: (data: Uint8Array | string, options?: ImageOptions) => string;
  /** OSC 50 + OSC 9;9, the two halves upstream concatenates. Projects to nothing. */
  setCwd: (cwd?: string) => string;
}

/**
 * The surface bound to a runtime you supply.
 *
 * The exported functions are this over {@link processRuntime}. A caller that has its own
 * `Runtime` — a test, a host that knows better than our guesses, a server rendering for
 * somebody else's terminal — calls this instead and nothing reads `process`.
 */
export function ansiEscapesFor(runtime: Runtime): AnsiEscapes {
  return {
    beep: BEL,
    link: (text, url) => emit(runtime, 'link', { text, url }),
    // Through `emit`, not through the record: a caller who re-registered `image` to correct
    // our guess about their terminal must change what this returns. `paratext/term-img` is
    // the one that renders the record directly, because it carries no registry.
    image: (data, options = {}) => emit(runtime, 'image', imageFields(data, options)),
    setCwd: (cwd) => emit(runtime, 'cwd', { path: cwd ?? runtime.cwd ?? '' }),
  };
}

/**
 * The bell, byte-identical to `ansi-escapes`' `beep`.
 *
 * The one member of this surface that does not degrade, because it is a value and not a
 * call: there is no runtime to consult at the moment a constant is read. It is also one
 * byte rather than a sequence, so a pipe that receives it gets a byte, not a smear of
 * unreadable escape text. `emit(runtime, 'bell')` is the form that degrades.
 */
export const beep = BEL;

/** OSC 8 — `link(text, url)`, projecting to `text (url)` where hyperlinks are not understood. */
export const link = (text: string, url: string): string => ansiEscapesFor(processRuntime()).link(text, url);

/** OSC 1337 — `image(data, options)`, projecting to `options.caption`. */
export const image = (data: Uint8Array | string, options: ImageOptions = {}): string => ansiEscapesFor(processRuntime()).image(data, options);

/** OSC 50 + OSC 9;9 — `setCwd(cwd)`, defaulting to the runtime's own, projecting to nothing. */
export const setCwd = (cwd?: string): string => ansiEscapesFor(processRuntime()).setCwd(cwd);

/**
 * The type of a name that is declared and not implemented.
 *
 * Reading one gets `undefined`; *calling* one does not type-check, which is the point. A
 * compile error that lands on this type is a sentence telling you which package owns the
 * thing you asked for, and it arrives before you ship rather than after.
 */
export type NotImplemented = undefined;


/*
 * OSC, and still not implemented — which is a different sentence and deserves its own block.
 *
 * `iTerm.annotation` and ConEmu's progress bar are this package's layer; there is simply no
 * capability for either yet. Adding one is a record in `builtins.ts`, or a plugin's, and
 * these two names become the fifth and sixth members of the surface when it happens. Until
 * then they are declared and empty for the same loading reason as the block above.
 */
export const iTerm: NotImplemented = undefined;
export const ConEmu: NotImplemented = undefined;

/**
 * The default export, carrying what this package implements: the CSI half and the four OSC
 * members. `iTerm` and `ConEmu` stay off it — a key present with an `undefined` value would
 * read as a claim made and not kept. Frozen, because the incumbent's own suite asserts
 * that a named export and the member are the same object and a caller reassigning one would
 * make that quietly untrue.
 */
// eslint-disable-next-line import-next/no-default-export -- the incumbent's entry is a default export and R8 is the whole point of this file
export default Object.freeze({ ...csi, beep, image, link, setCwd });

/**
 * `ansi-escapes`' `image()` options, declared beside the record in `image.ts` and re-exported
 * here under the name this surface has always published. `paratext/term-img` takes the same
 * object, and one definition is what keeps the two façades describing one call.
 */
export { type ImageOptions };
export { beginSynchronizedOutput, clearScreen, clearTerminal, clearViewport, cursorBackward, cursorDown, cursorForward, cursorGetPosition, cursorHide, cursorLeft, cursorMove, cursorNextLine, cursorPrevLine, cursorRestorePosition, cursorSavePosition, cursorShow, cursorTo, cursorUp, endSynchronizedOutput, enterAlternativeScreen, eraseDown, eraseEndLine, eraseLine, eraseLines, eraseScreen, eraseStartLine, eraseUp, exitAlternativeScreen, scrollDown, scrollUp, synchronizedOutput } from './csi.js';

