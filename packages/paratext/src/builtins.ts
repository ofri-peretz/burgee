/**
 * The capabilities this package ships — seven plain objects, registered through the public
 * `register`, which is the same call a third party makes. Nothing here reaches past
 * `capability.ts`, `link.ts` and `image.ts`, so a built-in cannot grow a power a stranger's
 * plugin lacks (flagstaff U4).
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
import { IMAGE } from './image.js';
import { LINK } from './link.js';

const BEL = '\u0007';
const OSC = '\u001B]';

/** Terminals that announce themselves and are known to do the richer sequences. */
const RICH = ['iTerm.app', 'WezTerm', 'ghostty'] as const;

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
export const builtins: readonly Capability[] = [bell, clipboard, cwd, IMAGE, LINK, notify, title];

/** Registered through the public call, so the built-ins prove the extension surface works. */
export function registerBuiltins(): void {
  for (const capability of builtins) register(capability);
}

/**
 * OSC 8 — a hyperlink, and OSC 1337 — an inline image. Declared in `link.ts` and `image.ts`
 * rather than here, and re-exported under the names they have always had.
 *
 * They are the two built-ins a caller may want **without** the registry: `paratext/link` and
 * `paratext/term-img` are subpaths that reach neither `capability.js` nor `schema.json`, so a
 * program that puts one clickable URL in its `--help`, or one inline image on an iTerm2, does
 * not load a plugin contract to do it. Keeping each record in its own module and re-exporting
 * it here means the object the registry ships and the object the subpath emits are the same
 * one, rather than two copies free to drift.
 */
export { IMAGE as image, LINK as link };
