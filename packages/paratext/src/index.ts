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

export { bell, clipboard, cwd, image, link, notify, registerBuiltins, title } from './builtins.js';
export { type Capability, CapabilityError, type Fields, capabilities, capability, emit, register, reset } from './capability.js';
export { processRuntime, type Runtime } from './runtime.js';
