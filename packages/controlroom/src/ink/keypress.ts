/**
 * Ink's key decoding, which its `useInput` contract is written against: the stream split into
 * key events (a CSI or SS3 sequence whole, a lone Escape held until the next tick), and each
 * event parsed into a key — legacy xterm/rxvt/putty sequences, and the kitty keyboard
 * protocol's `CSI … u` form. caique/keys decodes through node's readline for the native API;
 * this is the decoder Ink programs were written for, so it lives with the drop-in.
 */
const ESC = '\u001B';

// ── Splitting a chunk into key events ───────────────────────────────────────────────────

type Parsed = { sequence: string; next: number } | 'pending' | undefined;

const inRange = (code: number | undefined, low: number, high: number): boolean => code !== undefined && code >= low && code <= high;

function parseCsi(input: string, start: number, prefix: number): Parsed {
  const payload = start + prefix + 1;
  for (let index = payload; index < input.length; index += 1) {
    const byte = input.codePointAt(index);
    if (inRange(byte, 0x20, 0x3f)) continue;
    // Legacy function keys: ESC [ [ A, ESC [ [ 5 ~.
    if (byte === 0x5b && index === payload) continue;
    if (inRange(byte, 0x40, 0x7e)) return { sequence: input.slice(start, index + 1), next: index + 1 };
    return undefined;
  }
  return 'pending';
}

function parseControl(input: string, start: number, prefix: number): Parsed {
  const kind = input[start + prefix];
  if (kind === undefined) return 'pending';
  if (kind === '[') return parseCsi(input, start, prefix);
  if (kind === 'O') {
    const next = start + prefix + 2;
    if (next > input.length) return 'pending';
    return inRange(input.codePointAt(next - 1), 0x40, 0x7e) ? { sequence: input.slice(start, next), next } : undefined;
  }
  return undefined;
}

function split(input: string): { events: string[]; pending: string } {
  const events: string[] = [];
  let index = 0;
  while (index < input.length) {
    const escape = input.indexOf(ESC, index);
    if (escape === -1) {
      events.push(input.slice(index));
      return { events, pending: '' };
    }
    if (escape > index) events.push(input.slice(index, escape));
    if (escape === input.length - 1) return { events, pending: input.slice(escape) };
    const parsed = parseControl(input, escape, 1);
    if (parsed === 'pending') return { events, pending: input.slice(escape) };
    if (parsed !== undefined) {
      events.push(parsed.sequence);
      index = parsed.next;
      continue;
    }
    if (input[escape + 1] === ESC) {
      if (escape + 2 >= input.length) return { events, pending: input.slice(escape) };
      const doubled = parseControl(input, escape, 2);
      if (doubled === 'pending') return { events, pending: input.slice(escape) };
      if (doubled !== undefined) {
        events.push(doubled.sequence);
        index = doubled.next;
        continue;
      }
      events.push(input.slice(escape, escape + 2));
      index = escape + 2;
      continue;
    }
    const codePoint = input.codePointAt(escape + 1)!;
    const next = escape + 1 + (codePoint > 0xffff ? 2 : 1);
    events.push(input.slice(escape, next));
    index = next;
  }
  return { events, pending: '' };
}

export interface InputParser {
  push(chunk: string): string[];
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
    hasPendingEscape: () => pending.startsWith(ESC),
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

// ── Parsing one key event ───────────────────────────────────────────────────────────────

export interface Keypress {
  name: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  option: boolean;
  sequence: string;
  raw?: string | undefined;
  code?: string;
  super?: boolean;
  hyper?: boolean;
  capsLock?: boolean;
  numLock?: boolean;
  eventType?: 'press' | 'repeat' | 'release';
  isKittyProtocol?: boolean;
  isPrintable?: boolean;
  text?: string | undefined;
}

const KEY_NAMES: Readonly<Record<string, string>> = {
  OP: 'f1', OQ: 'f2', OR: 'f3', OS: 'f4',
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

// eslint-disable-next-line no-control-regex -- the escape is the sequence being matched
const META_KEY = /^\u001B([a-zA-Z0-9])$/u;
// eslint-disable-next-line no-control-regex -- as above
const FN_KEY = /^\u001B+(O|N|\[|\[\[)(?:(\d+)(?:;(\d+))?([~^$])|(?:1;)?(\d+)?([a-zA-Z]))/u;
/**
 * The kitty protocol's two forms, matched on a CSI's parameters and final byte — what follows
 * `ESC [` — so the introducer is checked once, by `csiBody`, rather than spelled in each.
 */
const KITTY_KEY = /^(\d+)(?:;(\d+)(?::(\d+))?(?:;([\d:]+))?)?u$/u;
const KITTY_SPECIAL = /^(\d+);(\d+):(\d+)([A-Za-z~])$/u;
const csiBody = (s: string): string => (s.startsWith(ESC) && s[1] === '[' ? s.slice(2) : '');

/** kitty's modifier bits: shift, alt, ctrl, super, hyper, meta, caps lock, num lock. */
export const kittyModifiers = { shift: 1, alt: 2, ctrl: 4, super: 8, hyper: 16, meta: 32, capsLock: 64, numLock: 128 } as const;
/** kitty's progressive-enhancement flags. */
export const kittyFlags = { disambiguateEscapeCodes: 1, reportEventTypes: 2, reportAlternateKeys: 4, reportAllKeysAsEscapeCodes: 8, reportAssociatedText: 16 } as const;
export type KittyFlagName = keyof typeof kittyFlags;

export function resolveFlags(flags: readonly KittyFlagName[]): number {
  let result = 0;
  for (const flag of flags) result |= kittyFlags[flag];
  return result;
}

const SPECIAL_LETTERS: Readonly<Record<string, string>> = { A: 'up', B: 'down', C: 'right', D: 'left', E: 'clear', F: 'end', H: 'home', P: 'f1', Q: 'f2', R: 'f3', S: 'f4' };
const SPECIAL_NUMBERS: Readonly<Record<number, string>> = {
  2: 'insert', 3: 'delete', 5: 'pageup', 6: 'pagedown', 7: 'home', 8: 'end',
  11: 'f1', 12: 'f2', 13: 'f3', 14: 'f4', 15: 'f5', 17: 'f6', 18: 'f7', 19: 'f8', 20: 'f9', 21: 'f10', 23: 'f11', 24: 'f12',
};

/** kitty's functional keys by code point: the named few, then a generated run for the private-use block. */
const KITTY_NAMES: Readonly<Record<number, string>> = (() => {
  const names: Record<number, string> = { 27: 'escape', 9: 'tab', 127: 'delete', 8: 'backspace' };
  const run = (from: number, list: string[]): void => list.forEach((name, i) => (names[from + i] = name));
  run(57_358, ['capslock', 'scrolllock', 'numlock', 'printscreen', 'pause', 'menu']);
  run(57_376, Array.from({ length: 23 }, (_, i) => `f${13 + i}`));
  run(57_399, [...Array.from({ length: 10 }, (_, i) => `kp${i}`), 'kpdecimal', 'kpdivide', 'kpmultiply', 'kpsubtract', 'kpadd', 'kpenter', 'kpequal', 'kpseparator', 'kpleft', 'kpright', 'kpup', 'kpdown', 'kppageup', 'kppagedown', 'kphome', 'kpend', 'kpinsert', 'kpdelete', 'kpbegin']);
  run(57_428, ['mediaplay', 'mediapause', 'mediaplaypause', 'mediareverse', 'mediastop', 'mediafastforward', 'mediarewind', 'mediatracknext', 'mediatrackprevious', 'mediarecord', 'lowervolume', 'raisevolume', 'mutevolume']);
  run(57_441, ['leftshift', 'leftcontrol', 'leftalt', 'leftsuper', 'lefthyper', 'leftmeta', 'rightshift', 'rightcontrol', 'rightalt', 'rightsuper', 'righthyper', 'rightmeta', 'isoLevel3Shift', 'isoLevel5Shift']);
  return names;
})();

const validCodePoint = (cp: number): boolean => cp >= 0 && cp <= 0x10_ffff && !(cp >= 0xd8_00 && cp <= 0xdf_ff);
const fromCodePoint = (cp: number): string => (validCodePoint(cp) ? String.fromCodePoint(cp) : '?');
const eventTypeOf = (value: number): 'press' | 'repeat' | 'release' => (value === 3 ? 'release' : value === 2 ? 'repeat' : 'press');

function modifiersOf(bits: number): Pick<Keypress, 'ctrl' | 'shift' | 'meta' | 'option' | 'super' | 'hyper' | 'capsLock' | 'numLock'> {
  return {
    ctrl: (bits & kittyModifiers.ctrl) !== 0,
    shift: (bits & kittyModifiers.shift) !== 0,
    meta: (bits & kittyModifiers.meta) !== 0,
    option: (bits & kittyModifiers.alt) !== 0,
    super: (bits & kittyModifiers.super) !== 0,
    hyper: (bits & kittyModifiers.hyper) !== 0,
    capsLock: (bits & kittyModifiers.capsLock) !== 0,
    numLock: (bits & kittyModifiers.numLock) !== 0,
  };
}

function parseKitty(s: string): Keypress | undefined {
  const match = KITTY_KEY.exec(csiBody(s));
  if (match === null) return undefined;
  const codePoint = Number.parseInt(match[1]!, 10);
  if (!validCodePoint(codePoint)) return undefined;
  const bits = match[2] === undefined ? 0 : Math.max(0, Number.parseInt(match[2], 10) - 1);
  const eventType = match[3] === undefined ? 1 : Number.parseInt(match[3], 10);
  let text = match[4]?.split(':').map((cp) => fromCodePoint(Number.parseInt(cp, 10))).join('');
  let name: string;
  let isPrintable: boolean;
  if (codePoint === 32) [name, isPrintable] = ['space', true];
  else if (codePoint === 13) [name, isPrintable] = ['return', true];
  else if (KITTY_NAMES[codePoint] !== undefined) [name, isPrintable] = [KITTY_NAMES[codePoint], false];
  else if (codePoint >= 1 && codePoint <= 26) [name, isPrintable] = [String.fromCodePoint(codePoint + 96), false];
  else [name, isPrintable] = [fromCodePoint(codePoint).toLowerCase(), true];
  if (isPrintable && (text === undefined || text === '')) text = fromCodePoint(codePoint);
  return { name, ...modifiersOf(bits), eventType: eventTypeOf(eventType), sequence: s, raw: s, isKittyProtocol: true, isPrintable, text };
}

function parseKittySpecial(s: string): Keypress | undefined {
  const match = KITTY_SPECIAL.exec(csiBody(s));
  if (match === null) return undefined;
  const number = Number.parseInt(match[1]!, 10);
  const bits = Math.max(0, Number.parseInt(match[2]!, 10) - 1);
  const terminator = match[4]!;
  const name = terminator === '~' ? SPECIAL_NUMBERS[number] : SPECIAL_LETTERS[terminator];
  if (name === undefined) return undefined;
  return { name, ...modifiersOf(bits), eventType: eventTypeOf(Number.parseInt(match[3]!, 10)), sequence: s, raw: s, isKittyProtocol: true, isPrintable: false };
}

/** One key event to a key, as Ink's `parseKeypress` reads it. */
export function parseKeypress(input: string | Buffer = ''): Keypress {
  let s: string;
  if (Buffer.isBuffer(input)) {
    if (input[0]! > 127 && input[1] === undefined) {
      input[0]! -= 128;
      s = `${ESC}${String(input)}`;
    } else s = String(input);
  } else s = typeof input === 'string' ? input : String(input);
  const kitty = parseKitty(s) ?? parseKittySpecial(s);
  if (kitty !== undefined) return kitty;
  if (KITTY_KEY.test(csiBody(s))) return { name: '', ctrl: false, meta: false, shift: false, option: false, sequence: s, raw: s, isKittyProtocol: true, isPrintable: false };
  const key: Keypress = { name: '', ctrl: false, meta: false, shift: false, option: false, sequence: s, raw: s };
  let parts: RegExpExecArray | null;
  if (s === '\r' || s === `${ESC}\r`) {
    key.raw = undefined;
    key.name = 'return';
    key.option = s.length === 2;
  } else if (s === '\n') key.name = 'enter';
  else if (s === '\t') key.name = 'tab';
  else if (s === '\b' || s === `${ESC}\b`) {
    key.name = 'backspace';
    key.meta = s.startsWith(ESC);
  } else if (s === '\u007F' || s === `${ESC}\u007F`) {
    key.name = 'delete';
    key.meta = s.startsWith(ESC);
  } else if (s === ESC || s === `${ESC}${ESC}`) {
    key.name = 'escape';
    key.meta = s.length === 2;
  } else if (s === ' ' || s === `${ESC} `) {
    key.name = 'space';
    key.meta = s.length === 2;
  } else if (s.length === 1 && s <= '\u001A') {
    key.name = String.fromCodePoint(s.codePointAt(0)! + 96);
    key.ctrl = true;
  } else if (s.length === 1 && s >= '0' && s <= '9') key.name = 'number';
  else if (s.length === 1 && s >= 'a' && s <= 'z') key.name = s;
  else if (s.length === 1 && s >= 'A' && s <= 'Z') {
    key.name = s.toLowerCase();
    key.shift = true;
  } else if ((parts = META_KEY.exec(s)) !== null) {
    key.meta = true;
    key.shift = /^[A-Z]$/u.test(parts[1]!);
  } else if ((parts = FN_KEY.exec(s)) !== null) {
    const chars = [...s];
    if (chars[0] === ESC && chars[1] === ESC) key.option = true;
    const code = [parts[1], parts[2], parts[4], parts[6]].filter(Boolean).join('');
    const modifier = Number(parts[3] ?? parts[5] ?? 1) - 1;
    key.ctrl = (modifier & 4) !== 0 || CTRL_CODES.has(code);
    key.meta = (modifier & 10) !== 0;
    key.shift = (modifier & 1) !== 0 || SHIFT_CODES.has(code);
    key.code = code;
    key.name = KEY_NAMES[code] as string;
  }
  return key;
}
