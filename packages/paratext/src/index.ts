/**
 * paratext — everything around your terminal output that is not the output.
 *
 * *Paratext* is the literary term for what surrounds a text without being it: the title, the
 * cover, the margins, the notes. This package owns the terminal equivalent — **OSC**, the
 * escape class (`ESC ]`) that addresses the terminal *program* rather than the character
 * grid. Hyperlinks, inline images, the window title, the clipboard, desktop notifications,
 * the working directory, and the bell.
 *
 * The boundary is the terminal standard's, not ours, which is why it decides cases nobody
 * has raised yet:
 *
 *   SGR  `ESC [ … m`  how text looks            roundel
 *   CSI  `ESC [ …`    the grid                  flagstaff
 *   CSI  (to undo)    cursor, alternate screen  closeout
 *   OSC  `ESC ] …`    the terminal program      here
 *
 * **Nothing in this layer is detectable.** No terminal answers "do you do OSC 1337", so
 * every capability carries a static projection and `emit` returns it whenever support is
 * absent or unknown (PRINCIPLES rule 6). Emitting the bytes and hoping is what puts
 * `]1337;File=inline=1;…` across a user's screen, and it is what every incumbent does.
 *
 * **Terminals invent OSC codes faster than packages ship releases.** So the surface is a
 * registry rather than a fixed list: `register` adds or replaces a capability, the built-ins
 * use that same call, and a caller whose terminal we mis-detect can correct us without
 * forking. See `capability.ts`.
 */
import { registerBuiltins } from './builtins.js';

// Importing the package registers what it ships. A caller that wants an empty registry calls
// `reset()`; a caller that wants ours plus theirs just registers theirs on top.
registerBuiltins();

/**
 * **R8: the root is `ansi-escapes`' surface.** `link` and `image` here are its *functions*,
 * not this package's capability records — `link(text, url)` and `image(data, options)` — so
 * that a caller who changes one specifier in an import gets what they asked for rather than
 * an object shaped nothing like it. The other five records are still exported by name,
 * because `ansi-escapes` has no member called `bell`, `clipboard`, `cwd`, `notify` or
 * `title` and there is nothing for them to collide with. The two that moved are reached as
 * `capability('link')` and `capability('image')`, or through `builtins`.
 */
// eslint-disable-next-line import-next/no-default-export -- the root default IS the drop-in surface; see ansi-escapes.ts
export { default, ansiEscapesFor, type AnsiEscapes, beep, beginSynchronizedOutput, clearScreen, clearTerminal, clearViewport, ConEmu, cursorBackward, cursorDown, cursorForward, cursorGetPosition, cursorHide, cursorLeft, cursorMove, cursorNextLine, cursorPrevLine, cursorRestorePosition, cursorSavePosition, cursorShow, cursorTo, cursorUp, endSynchronizedOutput, enterAlternativeScreen, eraseDown, eraseEndLine, eraseLine, eraseLines, eraseScreen, eraseStartLine, eraseUp, exitAlternativeScreen, image, type ImageOptions, iTerm, link, type NotImplemented, scrollDown, scrollUp, setCwd, synchronizedOutput } from './ansi-escapes.js';
export { bell, builtins, clipboard, cwd, notify, registerBuiltins, title } from './builtins.js';
export { type Capability, CapabilityError, DEPRECATED, type Fields, type Support, capabilities, capability, check, emit, isDeprecation, refusals, register, reset, supports } from './capability.js';
export { processRuntime, type Runtime } from './runtime.js';
export { fieldsUsed, render } from './template.js';
