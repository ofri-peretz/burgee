/**
 * The capabilities this package ships, registered through the public `register` — the same
 * call a third party makes. Nothing here reaches past `capability.ts`, so a built-in cannot
 * grow a power a stranger's plugin lacks (flagstaff U4).
 *
 * Every `supports` here is a guess dressed honestly. No terminal answers "do you do OSC
 * 1337", so these read `TERM_PROGRAM` and friends the way `roundel/policy.ts` reads colour
 * support — and every one is overridable by registering the same name again.
 */
import { type Capability, type Fields, register } from './capability.js';
import { type Runtime } from './runtime.js';

/**
 * The fields each built-in reads, as documentation rather than as types: the registry takes
 * one flat record so a capability can be written down, validated and shipped as data.
 *
 *   link       text, url
 *   image      base64, caption, width?, height?
 *   title      text
 *   clipboard  text
 *   notify     title, body?
 *   cwd        path
 *   bell       —
 */

/** The string terminator OSC sequences end with. An escape, never a literal byte: an
 * invisible control character in source is un-greppable and lint refuses it. */
const BEL = '\u0007';
/** Operating System Command — the escape class that addresses the terminal, not the grid. */
const OSC = '\u001B]';

/** OSC needs a terminal, not a pipe: a file that receives these gets control bytes in it. */
const interactive = (runtime: Runtime): boolean => runtime.isTTY.stdout && runtime.env['TERM'] !== 'dumb';

const program = (runtime: Runtime): string => runtime.env['TERM_PROGRAM'] ?? '';

/**
 * OSC 8 — a hyperlink. Widely supported and, unusually for this layer, partly detectable:
 * VTE ships its version and the well-known terminals announce themselves.
 */
export const link: Capability = {
  name: 'link',
  supports: (runtime) =>
    interactive(runtime) &&
    (runtime.env['VTE_VERSION'] !== undefined ||
      runtime.env['WT_SESSION'] !== undefined ||
      ['iTerm.app', 'WezTerm', 'ghostty', 'vscode', 'Hyper', 'Apple_Terminal'].includes(program(runtime))),
  encode: ({ text = '', url = '' }) => `${OSC}8;;${url}${BEL}${text}${OSC}8;;${BEL}`,
  // `text (url)` rather than bare text: a link whose destination vanishes in a pipe has lost
  // the half that mattered.
  fallback: ({ text = '', url = '' }) => (text === url || url === '' ? text : `${text} (${url})`),
};

/** OSC 1337 — iTerm2's inline image. Kitty and Sixel are their own capabilities. */
export const image: Capability = {
  name: 'image',
  supports: (runtime) => interactive(runtime) && program(runtime) === 'iTerm.app',
  encode: ({ base64 = '', width, height }) => {
    const parts = ['inline=1', width === undefined ? '' : `width=${width}`, height === undefined ? '' : `height=${height}`].filter(Boolean);
    return `${OSC}1337;File=${parts.join(';')}:${base64}${BEL}`;
  },
  fallback: ({ caption = '' }) => caption,
};

/** OSC 0 — the window and tab title. */
export const title: Capability = {
  name: 'title',
  supports: interactive,
  encode: ({ text = '' }) => `${OSC}0;${text}${BEL}`,
  // A title is chrome, not content: printing it into a log would be noise, not a fallback.
  fallback: () => '',
};

/**
 * OSC 52 — put text on the *user's* clipboard through the terminal, which is the only way
 * that works over ssh. `clipboardy` shells out to `pbcopy` and cannot.
 */
export const clipboard: Capability = {
  name: 'clipboard',
  supports: interactive,
  encode: ({ text = '' }) => `${OSC}52;c;${Buffer.from(text, 'utf8').toString('base64')}${BEL}`,
  fallback: () => '',
};

/** OSC 9 — a desktop notification, without `node-notifier`'s native binaries. */
export const notify: Capability = {
  name: 'notify',
  supports: (runtime) => interactive(runtime) && ['iTerm.app', 'WezTerm', 'ghostty'].includes(program(runtime)),
  encode: ({ title: heading = '', body }) => `${OSC}9;${body === undefined ? heading : `${heading}: ${body}`}${BEL}`,
  fallback: ({ title: heading = '', body }) => (body === undefined ? heading : `${heading}: ${body}`),
};

/** OSC 50 and 9;9 — tell the emulator where we are, so a new tab opens here. */
export const cwd: Capability = {
  name: 'cwd',
  supports: interactive,
  encode: ({ path = '' }) => `${OSC}50;CurrentDir=${path}${BEL}${OSC}9;9;${path}${BEL}`,
  fallback: () => '',
};

/** BEL — the oldest one, and the only member of this layer that is not an OSC sequence. */
export const bell: Capability = {
  name: 'bell',
  supports: interactive,
  encode: () => BEL,
  fallback: () => '',
};

/** Registered in one place, so `capabilities()` returns the list a reader sees here. */
export function registerBuiltins(): void {
  register(link);
  register(image);
  register(title);
  register(clipboard);
  register(notify);
  register(cwd);
  register(bell);
}
