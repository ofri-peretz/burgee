/**
 * R8 — the `ansi-escapes` surface, for the half of it paratext owns.
 *
 * `ansi-escapes` is one module with two unrelated jobs in it. Most of its thirty-seven
 * members are **CSI**: move the cursor, erase a line, swap to the alternate screen — the
 * character grid, which `flagstaff` draws and `closeout` puts back. Four are **OSC**: talk
 * to the terminal *program* about a hyperlink, an image, the working directory, and the
 * bell. Those four are this package, and they are the four implemented here.
 *
 * **The one deliberate difference, and the reason to prefer this.** `ansi-escapes` emits
 * the bytes and lets the terminal sort it out; that is what puts `]1337;File=inline=1;…`
 * across the screen of anyone who piped your output to a file. Every function here goes
 * through {@link emit}, so on a terminal believed to understand the sequence you get the
 * incumbent's exact bytes, and everywhere else you get the capability's static projection —
 * `Docs (https://x.dev)` for a link, the caption for an image, nothing for a `setCwd`
 * (PRINCIPLES rule 6). Same call, same bytes where they work, something readable where they
 * do not.
 *
 * **Why the CSI names are here at all, as `undefined`.** A drop-in has to *load*. ESM
 * refuses a named import of a name the module does not export, so `import ansiEscapes, {
 * cursorTo } from 'paratext'` would be a `SyntaxError` that takes the file down before a
 * line of it runs — which is precisely the one line of TAP the compat oracle printed for
 * this row before R8 existed. So every name the incumbent exports is declared. The
 * thirty-three paratext does not implement are `undefined` and typed {@link NotImplemented},
 * which makes calling one a **compile error naming this comment** rather than a runtime
 * `TypeError` at three in the morning.
 *
 * Graded by `npm run compat -- ansi-escapes`. Its suite is four ava cases and three of them
 * assert CSI, so **the ceiling on that row is 1 / 4**: 25% there means complete. The
 * reasoning is written out in the `ansi-escapes` entry of `compat-oracle/src/hosts.ts`.
 */
import { registerBuiltins } from './builtins.js';
import { emit } from './capability.js';
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
 * The CSI half of `ansi-escapes` — the character grid.
 *
 * Out of scope by design, not by omission: `flagstaff` draws the grid and `closeout` puts
 * the cursor and the screen back, and a second implementation of either inside this package
 * would be the copy PRINCIPLES rule 2 exists to prevent. Declared so that a drop-in module
 * loads; `undefined` so that nothing here pretends to do it.
 */
export const cursorTo: NotImplemented = undefined;
export const cursorMove: NotImplemented = undefined;
export const cursorUp: NotImplemented = undefined;
export const cursorDown: NotImplemented = undefined;
export const cursorForward: NotImplemented = undefined;
export const cursorBackward: NotImplemented = undefined;
export const cursorLeft: NotImplemented = undefined;
export const cursorSavePosition: NotImplemented = undefined;
export const cursorRestorePosition: NotImplemented = undefined;
export const cursorGetPosition: NotImplemented = undefined;
export const cursorNextLine: NotImplemented = undefined;
export const cursorPrevLine: NotImplemented = undefined;
export const cursorHide: NotImplemented = undefined;
export const cursorShow: NotImplemented = undefined;
export const eraseLines: NotImplemented = undefined;
export const eraseEndLine: NotImplemented = undefined;
export const eraseStartLine: NotImplemented = undefined;
export const eraseLine: NotImplemented = undefined;
export const eraseDown: NotImplemented = undefined;
export const eraseUp: NotImplemented = undefined;
export const eraseScreen: NotImplemented = undefined;
export const scrollUp: NotImplemented = undefined;
export const scrollDown: NotImplemented = undefined;
export const clearViewport: NotImplemented = undefined;
export const clearScreen: NotImplemented = undefined;
export const clearTerminal: NotImplemented = undefined;
export const enterAlternativeScreen: NotImplemented = undefined;
export const exitAlternativeScreen: NotImplemented = undefined;
export const beginSynchronizedOutput: NotImplemented = undefined;
export const endSynchronizedOutput: NotImplemented = undefined;
export const synchronizedOutput: NotImplemented = undefined;

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
 * The default export, carrying only what this package implements.
 *
 * A CSI key present with an `undefined` value would read as a claim made and not kept, so
 * the object has four members and says so. Frozen, because the incumbent's own suite asserts
 * that a named export and the member are the same object and a caller reassigning one would
 * make that quietly untrue.
 */
// eslint-disable-next-line import-next/no-default-export -- the incumbent's entry is a default export and R8 is the whole point of this file
export default Object.freeze({ beep, image, link, setCwd });

/**
 * `ansi-escapes`' `image()` options, declared beside the record in `image.ts` and re-exported
 * here under the name this surface has always published. `paratext/term-img` takes the same
 * object, and one definition is what keeps the two façades describing one call.
 */
export { type ImageOptions };
