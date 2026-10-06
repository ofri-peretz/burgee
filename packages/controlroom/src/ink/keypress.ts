/**
 * ink's key decoding, which its `useInput` and `usePaste` contracts are written against: the
 * stream split into input events (a CSI or SS3 sequence whole, a bracketed paste whole, a lone
 * Escape held until the next tick, backspace and Ctrl+C on their own), and each key event
 * parsed into a key — legacy xterm/rxvt/putty sequences, and the kitty keyboard protocol's
 * `CSI … u` form. caique/keys decodes through node's readline for the native API; this is the
 * decoder ink 8 programs were written for, so it lives with the drop-in.
 */
const ESC = '\u001B';
/** `ESC [ 200 ~` and `ESC [ 201 ~`, built from their parts: bracketed paste's two markers. */
const PASTE_START = `${ESC}${'['}200~`;
const PASTE_END = `${ESC}${'['}201~`;

// ── Splitting a chunk into input events (ink's `input-parser.ts`) ───────────────────────

export type InputEvent = string | { readonly paste: string };

type Parsed = { sequence: string; next: number } | 'pending' | undefined;

const inRange = (code: number | undefined, low: number, high: number): boolean => code !== undefined && code >= low && code <= high;
const isCsiFinal = (code: number | undefined): boolean => inRange(code, 0x40, 0x7e);

function parseCsi(input: string, start: number, prefix: number): Parsed {
  const payload = start + prefix + 1;
  for (let index = payload; index < input.length; index += 1) {
    const byte = input.codePointAt(index);
    // Legacy function keys: ESC [ [ A, ESC [ [ 5 ~.
    if (byte === 0x5b && index === payload) continue;
    // Shifted editing keys in rxvt end in `$`, which is normally an intermediate byte.
    const rxvtShift = byte === 0x24 && index === payload + 1 && '235678'.includes(input[payload]!);
    if (rxvtShift || isCsiFinal(byte)) return { sequence: input.slice(start, index + 1), next: index + 1 };
    if (inRange(byte, 0x20, 0x3f)) continue;
    return undefined;
  }
  return 'pending';
}

function parseSs3(input: string, start: number, prefix: number): Parsed {
  for (let index = start + prefix + 1; index < input.length; index += 1) {
    const byte = input.codePointAt(index)!;
    if (isCsiFinal(byte)) return { sequence: input.slice(start, index + 1), next: index + 1 };
    // Modified SS3 keys carry numeric parameters separated by semicolons.
    if (byte !== 0x3b && (byte < 0x30 || byte > 0x39)) return undefined;
  }
  return 'pending';
}

function parseControl(input: string, start: number, prefix: number): Parsed {
  const kind = input[start + prefix];
  if (kind === undefined) return 'pending';
  if (kind === '[') return parseCsi(input, start, prefix);
  return kind === 'O' ? parseSs3(input, start, prefix) : undefined;
}

/** Whether `input` is exactly one complete CSI or SS3 sequence, as the splitter reads one. */
export function isCompleteControlSequence(input: string): boolean {
  if (!input.startsWith(ESC)) return false;
  const parsed = parseControl(input, 0, input[1] === ESC ? 2 : 1);
  return typeof parsed === 'object' && parsed.next === input.length;
}

function parseEscape(input: string, at: number): { sequence: string; next: number } | 'pending' {
  if (at === input.length - 1) return 'pending';
  if (input[at + 1] === ESC) {
    if (at + 2 >= input.length) return 'pending';
    const doubled = parseControl(input, at, 2);
    if (doubled === 'pending') return 'pending';
    return doubled ?? { sequence: input.slice(at, at + 2), next: at + 2 };
  }
  const control = parseControl(input, at, 1);
  if (control === 'pending') return 'pending';
  if (control !== undefined) return control;
  const codePoint = input.codePointAt(at + 1)!;
  const next = at + 1 + (codePoint > 0xff_ff ? 2 : 1);
  return { sequence: input.slice(at, next), next };
}

/** Backspace (`DEL`, `BS`) and Ctrl+C on their own, so a held key or a buffered Ctrl+C still reads as one. */
function splitControlBytes(text: string, events: InputEvent[]): void {
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (character !== '\u007F' && character !== '\b' && character !== '\u0003') continue;
    if (index > start) events.push(text.slice(start, index));
    events.push(character);
    start = index + 1;
  }
  if (start < text.length) events.push(text.slice(start));
}

function split(input: string): { events: InputEvent[]; pending: string } {
  const events: InputEvent[] = [];
  let index = 0;
  while (index < input.length) {
    const escape = input.indexOf(ESC, index);
    if (escape === -1) {
      splitControlBytes(input.slice(index), events);
      return { events, pending: '' };
    }
    if (escape > index) splitControlBytes(input.slice(index, escape), events);
    const parsed = parseEscape(input, escape);
    if (parsed === 'pending') return { events, pending: input.slice(escape) };
    if (parsed.sequence === PASTE_START) {
      const end = input.indexOf(PASTE_END, parsed.next);
      if (end === -1) return { events, pending: input.slice(escape) };
      events.push({ paste: input.slice(parsed.next, end) });
      index = end + PASTE_END.length;
      continue;
    }
    events.push(parsed.sequence);
    index = parsed.next;
  }
  return { events, pending: '' };
}

export interface InputParser {
  push(chunk: string): InputEvent[];
  hasPendingEscape(): boolean;
  flushPendingEscape(): string | undefined;
  reset(): void;
}

export function createInputParser(): InputParser {
  let pending = '';
  return {
    push(chunk) {
      const parsed = split(pending + chunk);
      pending = parsed.pending;
      return parsed.events;
    },
    // A paste's start marker still arriving, or a paste waiting for its end, is not a lone Escape.
    hasPendingEscape: () => pending.startsWith(ESC) && !pending.startsWith(PASTE_START) && pending !== PASTE_START.slice(0, -1),
    flushPendingEscape() {
      if (!pending.startsWith(ESC)) return undefined;
      const flushed = pending;
      pending = '';
      return flushed;
    },
    reset() {
      pending = '';
    },
  };
}

// ── Parsing one key event (ink's `parse-keypress.ts`) ───────────────────────────────────

export interface Keypress {
  name: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  sequence: string;
  raw: string | undefined;
  code?: string;
  super?: boolean;
  hyper?: boolean;
  capsLock?: boolean;
  numLock?: boolean;
  eventType?: 'press' | 'repeat' | 'release';
  isKittyProtocol?: boolean;
  isPrintable?: boolean;
  text?: string;
}

const KEY_NAMES: Readonly<Record<string, string>> = {
  OP: 'f1', OQ: 'f2', OR: 'f3', OS: 'f4',
  '[P': 'f1', '[Q': 'f2', '[R': 'f3', '[S': 'f4',
  '[11~': 'f1', '[12~': 'f2', '[13~': 'f3', '[14~': 'f4',
  '[[A': 'f1', '[[B': 'f2', '[[C': 'f3', '[[D': 'f4', '[[E': 'f5',
  '[15~': 'f5', '[17~': 'f6', '[18~': 'f7', '[19~': 'f8', '[20~': 'f9', '[21~': 'f10', '[23~': 'f11', '[24~': 'f12',
  '[A': 'up', '[B': 'down', '[C': 'right', '[D': 'left', '[E': 'clear', '[F': 'end', '[H': 'home',
  OA: 'up', OB: 'down', OC: 'right', OD: 'left', OE: 'clear', OF: 'end', OH: 'home',
  '[1~': 'home', '[2~': 'insert', '[3~': 'delete', '[4~': 'end', '[5~': 'pageup', '[6~': 'pagedown',
  '[[5~': 'pageup', '[[6~': 'pagedown', '[7~': 'home', '[8~': 'end',
  '[a': 'up', '[b': 'down', '[c': 'right', '[d': 'left', '[e': 'clear',
  '[2$': 'insert', '[3$': 'delete', '[5$': 'pageup', '[6$': 'pagedown', '[7$': 'home', '[8$': 'end',
  Oa: 'up', Ob: 'down', Oc: 'right', Od: 'left', Oe: 'clear',
  '[2^': 'insert', '[3^': 'delete', '[5^': 'pageup', '[6^': 'pagedown', '[7^': 'home', '[8^': 'end',
  '[Z': 'tab',
};

/** Every name `useInput` reports with an empty `input`: the keys that are not text. */
export const nonAlphanumericKeys = [...Object.values(KEY_NAMES), 'backspace'];

const SHIFT_CODES = new Set(['[a', '[b', '[c', '[d', '[e', '[2$', '[3$', '[5$', '[6$', '[7$', '[8$', '[Z']);
const CTRL_CODES = new Set(['Oa', 'Ob', 'Oc', 'Od', 'Oe', '[2^', '[3^', '[5^', '[6^', '[7^', '[8^']);

const META_KEY = /^\u001B([^\p{C}[])$/u;
const FN_KEY = /^\u001B+(O|N|\[|\[\[)(?:(\d+)(?:;(\d+))?([~^$])|(?:1;)?(\d+)?([a-zA-Z]))/u;
const SPACE = /^\u001B?[ \u0000]$/u;
const CONTROL = /^\u001B?[\u0000-\u001F]$/u;
/**
 * The kitty protocol's two forms, matched on a CSI's parameters and final byte — what follows
 * `ESC [` — so the introducer is checked once, by `csiBody`, rather than spelled in each.
 */
const KITTY_KEY = /^(\d+)(?::\d*(?::\d+)?)?(?:;(\d*)(?::(\d+))?(?:;([\d:]+))?)?u$/u;
const KITTY_SPECIAL = /^(\d+)(?:;(\d+)(?::(\d+))?)?([A-Za-z~])$/u;
/** A kitty query reply's parameters and final byte. */
const KITTY_REPLY = /^\?\d+u$/u;
const csiBody = (s: string): string => (s.startsWith(ESC) && s[1] === '[' ? s.slice(2) : '\u0000');

/** kitty's modifier bits: shift, alt, ctrl, super, hyper, meta, caps lock, num lock. */
export const kittyModifiers = { shift: 1, alt: 2, ctrl: 4, super: 8, hyper: 16, meta: 32, capsLock: 64, numLock: 128 } as const;
/** kitty's progressive-enhancement flags. */
export const kittyFlags = { disambiguateEscapeCodes: 1, reportEventTypes: 2, reportAlternateKeys: 4, reportAllKeysAsEscapeCodes: 8, reportAssociatedText: 16 } as const;
export type KittyFlagName = keyof typeof kittyFlags;

/** The flags' bits; associated text is defined only with all-key reporting, so it brings that flag. */
export function resolveFlags(flags: readonly KittyFlagName[]): number {
  let result = 0;
  for (const flag of flags) result |= kittyFlags[flag];
  if (flags.includes('reportAssociatedText')) result |= kittyFlags.reportAllKeysAsEscapeCodes;
  return result;
}

const SPECIAL_LETTERS: Readonly<Record<string, string>> = { A: 'up', B: 'down', C: 'right', D: 'left', E: 'clear', F: 'end', H: 'home', P: 'f1', Q: 'f2', S: 'f4' };
const SPECIAL_NUMBERS: Readonly<Record<number, string>> = {
  2: 'insert', 3: 'delete', 5: 'pageup', 6: 'pagedown', 7: 'home', 8: 'end',
  11: 'f1', 12: 'f2', 13: 'f3', 14: 'f4', 15: 'f5', 17: 'f6', 18: 'f7', 19: 'f8', 20: 'f9', 21: 'f10', 23: 'f11', 24: 'f12',
  57_427: 'clear',
};

/** kitty's functional keys by code point: the named few, then each run of the private-use block. */
function kittyNames(): Record<number, string> {
  const names: Record<number, string> = { 27: 'escape', 9: 'tab', 127: 'backspace' };
  const run = (from: number, list: string[]): void => list.forEach((name, i) => (names[from + i] = name));
  run(57_358, ['capslock', 'scrolllock', 'numlock', 'printscreen', 'pause', 'menu']);
  run(57_376, Array.from({ length: 23 }, (_, i) => `f${13 + i}`));
  run(57_399, [...Array.from({ length: 10 }, (_, i) => `kp${i}`), 'kpdecimal', 'kpdivide', 'kpmultiply', 'kpsubtract', 'kpadd']);
  run(57_415, ['kpequal', 'kpseparator', 'left', 'right', 'up', 'down', 'pageup', 'pagedown', 'home', 'end', 'insert', 'delete']);
  run(57_428, ['mediaplay', 'mediapause', 'mediaplaypause', 'mediareverse', 'mediastop', 'mediafastforward', 'mediarewind', 'mediatracknext', 'mediatrackprevious', 'mediarecord', 'lowervolume', 'raisevolume', 'mutevolume']);
  run(57_441, ['leftshift', 'leftcontrol', 'leftalt', 'leftsuper', 'lefthyper', 'leftmeta', 'rightshift', 'rightcontrol', 'rightalt', 'rightsuper', 'righthyper', 'rightmeta', 'isoLevel3Shift', 'isoLevel5Shift']);
  return names;
}
const KITTY_NAMES: Readonly<Record<number, string>> = kittyNames();

const validCodePoint = (cp: number): boolean => cp >= 0 && cp <= 0x10_ffff && !(cp >= 0xd8_00 && cp <= 0xdf_ff);
const fromCodePoint = (cp: number): string => (validCodePoint(cp) ? String.fromCodePoint(cp) : '?');
const eventTypeOf = (value: number): 'press' | 'repeat' | 'release' => (value === 3 ? 'release' : value === 2 ? 'repeat' : 'press');

function modifiersOf(bits: number): Pick<Keypress, 'ctrl' | 'shift' | 'meta' | 'super' | 'hyper' | 'capsLock' | 'numLock'> {
  return {
    ctrl: (bits & kittyModifiers.ctrl) !== 0,
    shift: (bits & kittyModifiers.shift) !== 0,
    meta: (bits & (kittyModifiers.meta | kittyModifiers.alt)) !== 0,
    super: (bits & kittyModifiers.super) !== 0,
    hyper: (bits & kittyModifiers.hyper) !== 0,
    capsLock: (bits & kittyModifiers.capsLock) !== 0,
    numLock: (bits & kittyModifiers.numLock) !== 0,
  };
}

const modifierBits = (field: string | undefined): number => (field === undefined || field === '' ? 0 : Math.max(0, Number.parseInt(field, 10) - 1));

function parseKitty(s: string): Keypress | undefined {
  const match = KITTY_KEY.exec(csiBody(s));
  if (match === null) return undefined;
  let codePoint = Number.parseInt(match[1]!, 10);
  // Keypad Enter is the same key, with the same text, as Return.
  if (codePoint === 57_414) codePoint = 13;
  if (!validCodePoint(codePoint)) return undefined;
  const bits = modifierBits(match[2]);
  const eventType = match[3] === undefined || match[3] === '' ? 1 : Number.parseInt(match[3], 10);
  let text = match[4] === undefined || match[4] === '' ? undefined : match[4].split(':').map((cp) => fromCodePoint(Number.parseInt(cp, 10))).join('');
  let name: string;
  let isPrintable: boolean;
  if (codePoint === 32) [name, isPrintable] = ['space', true];
  else if (codePoint === 13) [name, isPrintable] = ['return', true];
  else if (KITTY_NAMES[codePoint] !== undefined) [name, isPrintable] = [KITTY_NAMES[codePoint]!, false];
  else if (codePoint < 32 || (codePoint >= 127 && codePoint <= 159) || (codePoint >= 57_344 && codePoint <= 63_743)) [name, isPrintable] = ['', false];
  else [name, isPrintable] = [fromCodePoint(codePoint).toLowerCase(), true];
  if (isPrintable && (text === undefined || text === '')) text = fromCodePoint(codePoint);
  const key: Keypress = { name, ...modifiersOf(bits), eventType: eventTypeOf(eventType), sequence: s, raw: s, isKittyProtocol: true, isPrintable: isPrintable || text !== undefined };
  if (text !== undefined) key.text = text;
  return key;
}

function parseKittySpecial(s: string): Keypress | undefined {
  const match = KITTY_SPECIAL.exec(csiBody(s));
  if (match === null) return undefined;
  const number = Number.parseInt(match[1]!, 10);
  const terminator = match[4]!;
  if (terminator !== '~' && number !== 1) return undefined;
  const name = terminator === '~' ? SPECIAL_NUMBERS[number] : SPECIAL_LETTERS[terminator];
  if (name === undefined) return undefined;
  const eventType = match[3] === undefined ? 1 : Number.parseInt(match[3], 10);
  return { name, ...modifiersOf(modifierBits(match[2])), eventType: eventTypeOf(eventType), sequence: s, raw: s, isKittyProtocol: true, isPrintable: false };
}

const decoder = new TextDecoder();

/** One key event to a key, as ink's `parseKeypress` reads it. */
export function parseKeypress(input: Uint8Array | string = ''): Keypress {
  let s: string;
  if (input instanceof Uint8Array) {
    // A Meta byte (high bit set) is ESC and its ASCII, without touching the caller's buffer.
    s = input[0]! > 127 && input[1] === undefined ? ESC + String.fromCodePoint(input[0]! - 128) : decoder.decode(input);
  } else s = typeof input === 'string' ? input : String(input);
  const kitty = parseKitty(s) ?? parseKittySpecial(s);
  if (kitty !== undefined) return kitty;
  if (KITTY_KEY.test(csiBody(s))) return { name: '', ctrl: false, meta: false, shift: false, sequence: s, raw: s, isKittyProtocol: true, isPrintable: false };
  const key: Keypress = { name: '', ctrl: false, meta: false, shift: false, sequence: s, raw: s };
  let parts: RegExpExecArray | null;
  if (s === '\r' || s === `${ESC}\r`) {
    key.raw = undefined;
    key.name = 'return';
    key.meta = s.length === 2;
  } else if (s === `${ESC}OM` || s === `${ESC}${ESC}OM`) {
    // Application keypad Enter has the same input value as Return.
    key.raw = undefined;
    key.name = 'return';
    key.sequence = '\r';
    key.meta = s.length === 4;
  } else if (s === '\n') key.name = 'enter';
  else if (s === '\t' || s === `${ESC}\t`) {
    key.name = 'tab';
    key.meta = s.length === 2;
  } else if (s === '\b' || s === `${ESC}\b` || s === '\u007F' || s === `${ESC}\u007F`) {
    key.name = 'backspace';
    key.meta = s.startsWith(ESC);
  } else if (s === ESC || s === `${ESC}${ESC}`) {
    key.name = 'escape';
    key.meta = s.length === 2;
  } else if (SPACE.test(s)) {
    key.name = 'space';
    key.ctrl = s.endsWith('\u0000');
    key.meta = s.length === 2;
  } else if (CONTROL.test(s)) {
    const codePoint = s.codePointAt(s.length - 1)!;
    key.name = String.fromCodePoint(codePoint + (codePoint <= 26 ? 96 : 64));
    key.ctrl = true;
    key.meta = s.length === 2;
  } else if (s.length === 1 && s >= '0' && s <= '9') key.name = 'number';
  else if (s.length === 1 && s >= 'a' && s <= 'z') key.name = s;
  else if (s.length === 1 && s >= 'A' && s <= 'Z') {
    key.name = s.toLowerCase();
    key.shift = true;
  } else if ((parts = META_KEY.exec(s)) !== null) {
    key.name = parts[1]!.toLowerCase();
    key.meta = true;
    key.shift = /^[A-Z]$/u.test(parts[1]!);
  } else if ((parts = FN_KEY.exec(s)) !== null) {
    const chars = [...s];
    if (chars[0] === ESC && chars[1] === ESC) key.meta = true;
    const code = [parts[1], parts[2], parts[4], parts[6]].filter(Boolean).join('');
    const modifier = Number(parts[3] || parts[5] || 1) - 1;
    key.ctrl = (modifier & 4) !== 0 || CTRL_CODES.has(code);
    key.meta = key.meta || (modifier & 10) !== 0;
    key.shift = (modifier & 1) !== 0 || SHIFT_CODES.has(code);
    key.code = code;
    key.name = KEY_NAMES[code] ?? '';
  }
  return key;
}

/** A kitty query reply, `ESC [ ? <flags> u`: the one terminal answer the input loop consumes. */
export function isKittyQueryReply(event: string): boolean {
  return KITTY_REPLY.test(csiBody(event));
}
