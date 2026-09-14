/**
 * The capabilities this package ships — seven plain objects, registered through the public
 * `register`, which is the same call a third party makes. Nothing here reaches past
 * `capability.ts`, so a built-in cannot grow a power a stranger's plugin lacks (flagstaff U4).
 *
 * Read them as the documentation of the format: each is a name, an OSC code, when a terminal
 * is believed to understand it, the bytes, and what to print when it does not. No functions,
 * so every one of these could equally have arrived from a JSON file.
 *
 * The fields each reads:
 *
 *   link       text, url
 *   image      base64, caption, width?, height?
 *   title      text
 *   clipboard  text
 *   notify     title, body?
 *   cwd        path
 *   bell       —
 */
import { type Capability, register } from './capability.js';

const BEL = '\u0007';
const OSC = '\u001B]';

/** Terminals that announce themselves and are known to do the richer sequences. */
const RICH = ['iTerm.app', 'WezTerm', 'ghostty'] as const;

/**
 * OSC 8 — a hyperlink. The widest support in this layer, and unusually semi-detectable: VTE
 * publishes its version and Windows Terminal sets a session variable.
 */
export const link: Capability = {
  name: 'link',
  osc: 8,
  when: { tty: true, termProgram: [...RICH, 'vscode', 'Hyper', 'Apple_Terminal'], envAny: ['VTE_VERSION', 'WT_SESSION'] },
  encode: `${OSC}8;;{url}${BEL}{text}${OSC}8;;${BEL}`,
  // `text (url)` rather than bare text: a link whose destination vanishes in a pipe has lost
  // the half that mattered. The optional group means a link with no url is just its text.
  fallback: '{text}[ ({url})]',
};

/**
 * OSC 1337 — iTerm2's inline image. Kitty and Sixel are their own capabilities.
 *
 * The four optional groups are `ansi-escapes`' four options, in its order, so that R8's
 * `image()` is byte-identical to the incumbent's for the same input rather than merely
 * call-compatible. `size` is the one worth a sentence: the protocol makes it optional and
 * xterm.js requires it, which is why upstream always writes it and why a caller that can
 * count the bytes should pass it.
 */
export const image: Capability = {
  name: 'image',
  osc: 1337,
  when: { tty: true, termProgram: ['iTerm.app'] },
  encode: `${OSC}1337;File=inline=1[;width={width}][;height={height}][;preserveAspectRatio={preserveAspectRatio}][;size={size}]:{base64}${BEL}`,
  fallback: '{caption}',
};

/** OSC 0 — the window and tab title. */
export const title: Capability = {
  name: 'title',
  osc: 0,
  when: { tty: true },
  encode: `${OSC}0;{text}${BEL}`,
  // A title is chrome, not content: printing it into a log would be noise, not a fallback.
  fallback: '',
};

/**
 * OSC 52 — put text on the *user's* clipboard through the terminal, which is the only way
 * that works over ssh. `clipboardy` shells out to `pbcopy` and cannot.
 */
export const clipboard: Capability = {
  name: 'clipboard',
  osc: 52,
  when: { tty: true },
  encode: `${OSC}52;c;{text|base64}${BEL}`,
  fallback: '',
};

/** OSC 9 — a desktop notification, without `node-notifier`'s native binaries. */
export const notify: Capability = {
  name: 'notify',
  osc: 9,
  when: { tty: true, termProgram: [...RICH] },
  encode: `${OSC}9;{title}[: {body}]${BEL}`,
  fallback: '{title}[: {body}]',
};

/** OSC 50 and 9;9 — tell the emulator where we are, so a new tab opens here. */
export const cwd: Capability = {
  name: 'cwd',
  osc: 50,
  when: { tty: true },
  encode: `${OSC}50;CurrentDir={path}${BEL}${OSC}9;9;{path}${BEL}`,
  fallback: '',
};

/** BEL — the oldest one, and the only member of this layer that is not an OSC sequence. */
export const bell: Capability = {
  name: 'bell',
  osc: 'BEL',
  when: { tty: true },
  encode: BEL,
  fallback: '',
};

/** Every capability this package ships, in one list a reader can check against the registry. */
export const builtins: readonly Capability[] = [bell, clipboard, cwd, image, link, notify, title];

/** Registered through the public call, so the built-ins prove the extension surface works. */
export function registerBuiltins(): void {
  for (const capability of builtins) register(capability);
}
