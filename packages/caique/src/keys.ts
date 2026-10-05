/**
 * `caique/keys` — key presses, decoded once, and keymaps that are data (controlroom R2).
 *
 * **One decoder.** Every key here comes out of `node:readline`'s `emitKeypressEvents`, the
 * decoder clack's loop and `@inquirer/core`'s already read. This file does not parse escape
 * sequences; it normalises what node reports into one small, stable shape — `KeyPress` — so a
 * caller never has to know that node calls Enter `return`, that a lone Escape arrives late
 * and marked `meta`, or that `!` has no `name` at all.
 *
 * **A keymap is data**: a plain object from a key spec (`'left'`, `'ctrl+c'`, `'s'`) to an
 * action name. `match()` reads it; `bindings()` lists it. A hint line built from `bindings()`
 * can therefore never name a key nothing is bound to, because the list *is* the binding.
 * A spec that names no key is refused with a `fix`, rather than silently never matching.
 *
 * **Raw mode is taken once, for the reader's whole life,** through `closeout/cursor`'s
 * `rawMode()`, which registers its undo on every exit path in the same call. It is never
 * toggled per key. And a reader asked to read keys from something that is not a terminal —
 * a pipe, a file, CI — throws at once with a `fix` (controlroom R7): a key that cannot
 * arrive is a wait that never ends, which is the failure this package exists to remove.
 */
import { emitKeypressEvents } from 'node:readline';
import { PassThrough } from 'node:stream';

import { type InputStream, rawMode, type Registrar } from 'closeout/cursor';
import exitHook from 'closeout/exit-hook';

/** One key press, as every consumer of this module sees it. */
export interface KeyPress {
  /**
   * `up`, `down`, `left`, `right`, `tab`, `enter`, `escape`, `backspace`, `delete`, `home`,
   * `end`, `pageup`, `pagedown`, `space`, a lowercase letter, any other printable character
   * as itself (`/`, `?`, `é`), or one of node's own names (`f1`, `insert`, `paste-start`).
   * Empty for a sequence nothing names, which no keymap can bind.
   */
  name: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  /** The characters the terminal sent for it. */
  sequence: string;
}

/** Key spec → action name. Plain data: it can be written in JSON and diffed. */
export type Keymap<Action extends string = string> = Readonly<Record<string, Action>>;

/** One entry of a keymap, with its key in the one spelling `match()` compares. */
export interface Binding<Action extends string = string> {
  key: string;
  action: Action;
}

export type KeysErrorCode = 'E_KEY_SPEC' | 'E_NOT_A_TERMINAL';

/** A refusal in the family's shape: what is wrong, and what to do about it. */
export class KeysError extends Error {
  constructor(
    readonly code: KeysErrorCode,
    message: string,
    readonly fix: string,
  ) {
    super(message);
    this.name = 'KeysError';
  }
}

/** What node hands a `keypress` listener, as far as this file reads it. */
interface NodeKey {
  name?: string | undefined;
  /** Always set: node reports the characters of every key it decodes. */
  sequence: string;
  ctrl?: boolean | undefined;
  meta?: boolean | undefined;
  shift?: boolean | undefined;
}

const ESC = '\u001B';

/** A single printable code point: what a key with no name of its own is called by. */
const printable = (text: string): boolean => [...text].length === 1 && text >= ' ' && text !== '\u007F';

/**
 * Node's report, normalised. Four of node's spellings are not what a person pressed:
 *
 * - Enter is `return` (CR, which is what Enter sends in raw mode); it is `enter` here.
 * - LF is reported as `enter` too, but in raw mode only Ctrl+J sends it — so it is `ctrl+j`,
 *   and a line editor can bind it to a newline without stealing Enter.
 * - A lone Escape is reported `meta`, because node reads it as the start of an Alt chord
 *   that never came. Escape pressed on its own has no modifier; Escape twice keeps `meta`.
 * - A sequence node does not recognise (`ESC [ 99 ~`, a kitty-protocol key) is named the
 *   *string* `'undefined'`; it is the empty name here, which no keymap can bind.
 */
function fromNode(key: NodeKey): KeyPress {
  const { sequence } = key;
  const pressed = { ctrl: key.ctrl === true, meta: key.meta === true, shift: key.shift === true, sequence };
  if (sequence === '\n') return { ...pressed, name: 'j', ctrl: true };
  if (key.name === 'return') return { ...pressed, name: 'enter' };
  if (sequence === ESC) return { ...pressed, name: 'escape', meta: false };
  if (key.name !== undefined && key.name !== 'undefined') return { ...pressed, name: key.name };
  if (!printable(sequence)) return { ...pressed, name: '' };
  // A character node has no name for (`!`, `é`, `É`) is called by itself — lowercased with
  // shift, as node reports a letter, so `É` and the spec `É` agree on what was pressed.
  const lower = sequence.toLowerCase();
  return { ...pressed, name: lower, shift: pressed.shift || lower !== sequence };
}

/**
 * How long a lone Escape waits to become a sequence: clack's 50 ms, not readline's 500.
 *
 * node types the decoder's second argument as a whole `readline.Interface` and reads this one
 * field of it, which is all a reader without an interface can give. `decode()` passes none:
 * a chunk decoded on its own has no rest coming, and nothing in it waits.
 */
// eslint-disable-next-line reliability/no-unsafe-type-narrowing -- the decoder reads `escapeCodeTimeout` and nothing else from its second argument
const LIVE = { escapeCodeTimeout: 50 } as unknown as Parameters<typeof emitKeypressEvents>[1];

/**
 * Every key in one chunk of input, in order — what one `data` event from a raw terminal means.
 *
 * The chunk goes through node's own decoder. The one thing node will not say synchronously is
 * a chunk that *ends* in Escape: it waits for the rest of a sequence, then reports `escape`.
 * A chunk decoded on its own has no rest, so that report is made here, as node would make it.
 * A partial sequence node is still holding (`ESC [`) is reported as nothing, which is also
 * what node does with it.
 */
export function decode(chunk: string): KeyPress[] {
  const stream = new PassThrough();
  emitKeypressEvents(stream);
  const keys: KeyPress[] = [];
  const listener = (_char: unknown, key: NodeKey): void => {
    keys.push(fromNode(key));
  };
  stream.on('keypress', listener);
  stream.emit('data', chunk);
  stream.removeListener('keypress', listener);
  const tail = chunk.slice(keys.reduce((length, key) => length + key.sequence.length, 0));
  if (/^\u001B{1,2}$/.test(tail)) keys.push(fromNode({ name: 'escape', meta: true, sequence: tail }));
  return keys;
}

/** The key names a spec may use, beyond a single printable character. */
const NAMED = new Set([
  ...['up', 'down', 'left', 'right', 'tab', 'enter', 'escape', 'backspace', 'delete', 'home', 'end', 'pageup', 'pagedown', 'space', 'insert'],
  ...Array.from({ length: 12 }, (_, i) => `f${String(i + 1)}`),
]);
const ALIASES: Readonly<Record<string, string>> = { esc: 'escape', return: 'enter', ' ': 'space' };
const MODIFIER: Readonly<Record<string, string>> = { ctrl: 'ctrl', meta: 'meta', alt: 'meta', shift: 'shift' };

/**
 * A spec split into its modifiers and the key after them, by one left-to-right walk. It was a
 * regular expression, `(modifier\+)*(.+)`, and CodeQL was right that it backtracks
 * polynomially on a long run of `alt+` — a keymap is data, and data can come from a file.
 * A `+` with nothing after it is the key `+` itself (`ctrl++`), never a modifier's separator.
 */
function split(spec: string): { modifiers: string[]; rawName: string } {
  const modifiers: string[] = [];
  let rest = spec;
  for (let at = rest.indexOf('+'); at > 0 && at < rest.length - 1; at = rest.indexOf('+')) {
    const modifier = MODIFIER[rest.slice(0, at).toLowerCase()];
    if (modifier === undefined) break;
    modifiers.push(modifier);
    rest = rest.slice(at + 1);
  }
  return { modifiers, rawName: rest };
}

/** The modifiers and name of a spec, in canonical order: `ctrl+meta+shift+name`. */
function spelled(modifiers: ReadonlySet<string>, name: string): string {
  return `${['ctrl', 'meta', 'shift'].filter((m) => modifiers.has(m)).map((m) => `${m}+`).join('')}${name}`;
}

/**
 * The one spelling of a key spec, or a `KeysError` naming what is wrong with it.
 *
 * Modifiers are `ctrl`, `meta` (or `alt`) and `shift`, in any order and any case. A named key
 * is case-insensitive (`PageUp`). A single uppercase letter on its own is that letter with
 * shift (`G` is `shift+g`, which is what the terminal sends for it); after a modifier its case
 * is ignored (`Ctrl+C` is `ctrl+c` — a terminal cannot tell the two apart anyway).
 */
export function canonical(spec: string): string {
  const { modifiers: named, rawName } = split(spec);
  const modifiers = new Set(named);
  const lower = rawName.toLowerCase();
  const name = ALIASES[lower] ?? lower;
  if (NAMED.has(name)) return spelled(modifiers, name);
  if (!printable(rawName)) {
    throw new KeysError('E_KEY_SPEC', `"${spec}" does not name a key`, `write a key as [ctrl+][meta+][shift+]<key>, where <key> is one character or one of: ${[...NAMED].join(', ')}`);
  }
  if (named.length === 0 && rawName !== lower) modifiers.add('shift');
  return spelled(modifiers, name);
}

/** A key press in a keymap's spelling, or `undefined` for a sequence nothing can bind. */
export function specOf(key: KeyPress): string | undefined {
  if (key.name === '') return undefined;
  const modifiers = new Set(['ctrl', 'meta', 'shift'].filter((m) => key[m as 'ctrl' | 'meta' | 'shift']));
  return spelled(modifiers, key.name);
}

/**
 * Every binding in a keymap, in the order it was written, with each key in canonical form.
 *
 * This is what a hint line is generated from. A spec that names no key, or two specs that name
 * the same key (`'G'` and `'shift+g'`), are refused here: a keymap that cannot be read one way
 * is a hint line that can lie.
 */
export function bindings<Action extends string>(keymap: Keymap<Action>): Binding<Action>[] {
  const seen = new Map<string, string>();
  return Object.entries(keymap).map(([spec, action]) => {
    const key = canonical(spec);
    const earlier = seen.get(key);
    if (earlier !== undefined) {
      throw new KeysError('E_KEY_SPEC', `"${spec}" and "${earlier}" are the same key`, `keep one of them; a key does one thing in a keymap`);
    }
    seen.set(key, spec);
    return { key, action };
  });
}

/** The action a key press is bound to in this keymap, or `undefined`. */
export function match<Action extends string>(keymap: Keymap<Action>, key: KeyPress): Action | undefined {
  const spec = specOf(key);
  return bindings(keymap).find((binding) => binding.key === spec)?.action;
}

/**
 * Whether keys can be read from this input at all: a terminal that can be put into raw mode.
 * A pipe, a file and `/dev/null` cannot, and no amount of waiting changes that.
 */
export function canReadKeys(input: InputStream): boolean {
  return input.isTTY === true && typeof input.setRawMode === 'function';
}

/** A readable terminal stream: `process.stdin`, or a test's double of one. */
export type KeyInput = NodeJS.ReadableStream & InputStream;

/**
 * Read key presses from a terminal until the returned function is called.
 *
 * Raw mode is taken **once**, here, and given back once, when the reader stops — or by the
 * exit path, on a signal or a crash, through `onExit` (closeout's exit hook by default). If
 * the input was already raw, somebody else owns that and it is left raw.
 *
 * Throws `E_NOT_A_TERMINAL` at once, before listening to anything, when `input` cannot be
 * read a key at a time (controlroom R7): the caller reads lines, or takes the flag, instead.
 */
export function readKeys(input: KeyInput, onKey: (key: KeyPress) => void, onExit: Registrar = exitHook): () => void {
  if (!canReadKeys(input)) {
    throw new KeysError('E_NOT_A_TERMINAL', 'keys can only be read from a terminal, and this input is not one', 'read lines from stdin instead, or pass the answer as a flag');
  }
  emitKeypressEvents(input, LIVE);
  const listener = (_char: unknown, key: NodeKey): void => {
    onKey(fromNode(key));
  };
  input.on('keypress', listener);
  const unraw = rawMode(input, onExit);
  input.resume();
  // Once only: a second call from a reader that already stopped must not pause the stream
  // under the next reader to open on it.
  let reading = true;
  return () => {
    if (!reading) return;
    reading = false;
    input.removeListener('keypress', listener);
    unraw();
    input.pause();
  };
}
