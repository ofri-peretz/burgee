/**
 * The ANSI handling ink's output grid needs, reproduced because ink's suite compares its bytes:
 *
 * - `tokenizeAnsi` reads a string into text, CSI, ESC, control-string, ST and C1 tokens by
 *   ECMA-48's byte classes, as ink 8's `ansi-tokenizer.ts` does;
 * - `sanitizeAnsi` keeps a text node's SGR (colon sub-parameters rewritten to the semicolon
 *   form) and OSC strings and drops every other control, as ink's `sanitize-ansi.ts` does;
 * - `styledChars` and `serialize` are the styled-cell grid's tokenizer and serializer, which
 *   re-emit a row with the fewest SGR changes between neighbouring cells — what
 *   `@alcalzone/ansi-tokenize` 0.3 does for ink.
 *
 * Widths are linegauge's. Every SGR this file emits is roundel's painter and every OSC 8 half
 * is paratext's record, so no escape sequence is spelled here (constraint 5). No sequence is
 * written to a stream; these are strings in and strings out.
 */
import { LINK } from 'paratext/link';
import { painter, UNPAINTED } from 'roundel/tokens';

const ESC = '\u001B';
const BEL = '\u0007';
const ST = '\u009C';
const C1_CSI = '\u009B';
const C1_OSC = '\u009D';
const C1_DCS = '\u0090';
const C1_PM = '\u009E';
const C1_APC = '\u009F';
const C1_SOS = '\u0098';

const code = (character: string | undefined): number => character?.codePointAt(0) ?? -1;
const inRange = (character: string | undefined, low: number, high: number): boolean => {
  const at = code(character);
  return at >= low && at <= high;
};
const isCsiParameter = (c: string | undefined): boolean => inRange(c, 0x30, 0x3f);
const isIntermediate = (c: string | undefined): boolean => inRange(c, 0x20, 0x2f);
const isCsiFinal = (c: string | undefined): boolean => inRange(c, 0x40, 0x7e);
const isEscapeFinal = (c: string | undefined): boolean => inRange(c, 0x30, 0x7e);
const isC1 = (c: string | undefined): boolean => inRange(c, 0x80, 0x9f);

// ── The tokenizer (ink's `ansi-tokenizer.ts`) ───────────────────────────────────────────

type ControlStringType = 'osc' | 'dcs' | 'pm' | 'apc' | 'sos';

export type AnsiToken =
  | { readonly type: 'text'; readonly value: string }
  | { readonly type: 'csi'; readonly value: string; readonly parameterString: string; readonly intermediateString: string; readonly finalCharacter: string }
  | { readonly type: 'esc'; readonly value: string; readonly intermediateString: string; readonly finalCharacter: string }
  | { readonly type: ControlStringType; readonly value: string }
  | { readonly type: 'st' | 'c1' | 'invalid'; readonly value: string };

function readCsi(text: string, from: number): { end: number; parameterString: string; intermediateString: string; finalCharacter: string } | undefined {
  let index = from;
  while (index < text.length && isCsiParameter(text[index])) index += 1;
  const parameterString = text.slice(from, index);
  const intermediateStart = index;
  while (index < text.length && isIntermediate(text[index])) index += 1;
  const finalCharacter = text[index];
  if (finalCharacter === undefined || !isCsiFinal(finalCharacter)) return undefined;
  return { end: index + 1, parameterString, intermediateString: text.slice(intermediateStart, index), finalCharacter };
}

/** Where a control string ends, or `undefined` when it never does. tmux doubles an ESC in a payload. */
function controlStringEnd(text: string, from: number, bell: boolean): number | undefined {
  for (let index = from; index < text.length; index += 1) {
    const c = text[index];
    if ((bell && c === BEL) || c === ST) return index + 1;
    if (c !== ESC) continue;
    const following = text[index + 1];
    if (following === ESC) index += 1;
    else if (following === '\\') return index + 2;
  }
  return undefined;
}

function readEscape(text: string, from: number): { end: number; intermediateString: string; finalCharacter: string } | undefined {
  let index = from;
  while (index < text.length && isIntermediate(text[index])) index += 1;
  const finalCharacter = text[index];
  if (finalCharacter === undefined || !isEscapeFinal(finalCharacter)) return undefined;
  return { end: index + 1, intermediateString: text.slice(from, index), finalCharacter };
}

const ESCAPE_STRINGS: Readonly<Record<string, { type: ControlStringType; bell: boolean }>> = {
  ']': { type: 'osc', bell: true },
  P: { type: 'dcs', bell: false },
  '^': { type: 'pm', bell: false },
  _: { type: 'apc', bell: false },
  X: { type: 'sos', bell: false },
};
const C1_STRINGS: Readonly<Record<string, { type: ControlStringType; bell: boolean }>> = {
  [C1_OSC]: { type: 'osc', bell: true },
  [C1_DCS]: { type: 'dcs', bell: false },
  [C1_PM]: { type: 'pm', bell: false },
  [C1_APC]: { type: 'apc', bell: false },
  [C1_SOS]: { type: 'sos', bell: false },
};

export function hasAnsiControlCharacters(text: string): boolean {
  if (text.includes(ESC)) return true;
  for (const character of text) if (isC1(character)) return true;
  return false;
}

/** ECMA-48's reading of `text`; a malformed sequence makes the rest of it one `invalid` token. */
export function tokenizeAnsi(text: string): AnsiToken[] {
  if (!hasAnsiControlCharacters(text)) return [{ type: 'text', value: text }];
  const tokens: AnsiToken[] = [];
  let textStart = 0;
  const flush = (to: number): void => {
    if (to > textStart) tokens.push({ type: 'text', value: text.slice(textStart, to) });
  };
  const malformed = (from: number): AnsiToken[] => {
    flush(from);
    tokens.push({ type: 'invalid', value: text.slice(from) });
    return tokens;
  };
  for (let index = 0; index < text.length; ) {
    const character = text[index]!;
    if (character === ESC) {
      const following = text[index + 1];
      if (following === undefined) return malformed(index);
      if (following === '[') {
        const csi = readCsi(text, index + 2);
        if (csi === undefined) return malformed(index);
        flush(index);
        tokens.push({ type: 'csi', value: text.slice(index, csi.end), parameterString: csi.parameterString, intermediateString: csi.intermediateString, finalCharacter: csi.finalCharacter });
        index = csi.end;
        textStart = index;
        continue;
      }
      const controlString = ESCAPE_STRINGS[following];
      if (controlString !== undefined) {
        const end = controlStringEnd(text, index + 2, controlString.bell);
        if (end === undefined) return malformed(index);
        flush(index);
        tokens.push({ type: controlString.type, value: text.slice(index, end) });
        index = end;
        textStart = index;
        continue;
      }
      const escape = readEscape(text, index + 1);
      if (escape === undefined) {
        if (isIntermediate(following)) return malformed(index);
        flush(index);
        index += 1;
        textStart = index;
        continue;
      }
      flush(index);
      tokens.push({ type: 'esc', value: text.slice(index, escape.end), intermediateString: escape.intermediateString, finalCharacter: escape.finalCharacter });
      index = escape.end;
      textStart = index;
      continue;
    }
    if (character === C1_CSI) {
      const csi = readCsi(text, index + 1);
      if (csi === undefined) return malformed(index);
      flush(index);
      tokens.push({ type: 'csi', value: text.slice(index, csi.end), parameterString: csi.parameterString, intermediateString: csi.intermediateString, finalCharacter: csi.finalCharacter });
      index = csi.end;
      textStart = index;
      continue;
    }
    const c1String = C1_STRINGS[character];
    if (c1String !== undefined) {
      const end = controlStringEnd(text, index + 1, c1String.bell);
      if (end === undefined) return malformed(index);
      flush(index);
      tokens.push({ type: c1String.type, value: text.slice(index, end) });
      index = end;
      textStart = index;
      continue;
    }
    if (character === ST || isC1(character)) {
      flush(index);
      tokens.push({ type: character === ST ? 'st' : 'c1', value: character });
      index += 1;
      textStart = index;
      continue;
    }
    index += 1;
  }
  flush(text.length);
  return tokens;
}

// ── Sanitizing a text node (ink's `sanitize-ansi.ts`) ────────────────────────────────────

/** An SGR pair's two escapes, emitted by roundel, which is where the family spells SGR. */
const pairOf = (open: number | string, close: number | string): Code => {
  const painted = painter(UNPAINTED, { open: String(open), close: String(close) });
  return { code: painted.open, end: painted.close };
};
/** One SGR escape with these parameters. */
export const sgr = (parameters: number | string): string => pairOf(parameters, parameters).code;

const SGR_PARAMETERS = /^[\d:;]*$/u;
// Terminals print nothing for C0 controls and DEL; tabs and newlines carry layout.
const CONTROL_CHARACTERS = /(?![\t\n])\p{Control}/gu;
const LEADING_MARKS = /^\p{Mark}+/u;

/**
 * A colon sub-parameter in the semicolon form the grid reads: 256-colour and truecolour map
 * losslessly, an underline style degrades to plain underline, anything else is dropped.
 */
function normalizeParameter(parameter: string): string | undefined {
  const parts = parameter.split(':');
  if (parts.length === 1) return parameter;
  if (parts[0] === '4') return parts[1] === '0' || parts[1] === '' ? '24' : '4';
  if (parts[0] !== '38' && parts[0] !== '48') return undefined;
  if (parts[1] === '5' && parts.length === 3) return parts.join(';');
  if (parts[1] === '2') {
    if (parts.length === 6 && (parts[2] === '' || parts[2] === '0')) parts.splice(2, 1);
    if (parts.length === 5) return parts.join(';');
  }
  return undefined;
}

/**
 * A text node's own escapes, minus everything but SGR and OSC: what ink's `sanitizeAnsi`
 * keeps. SGR is deferred past leading combining marks, which share their base's cell.
 */
export function sanitizeAnsi(text: string): string {
  if (!hasAnsiControlCharacters(text)) return text.replaceAll(CONTROL_CHARACTERS, '');
  let output = '';
  let pendingStyles = '';
  for (const token of tokenizeAnsi(text)) {
    if (token.type === 'text') {
      const value = token.value.replaceAll(CONTROL_CHARACTERS, '');
      const marks = LEADING_MARKS.exec(value)?.[0] ?? '';
      output += marks;
      if (value.length > marks.length) {
        output += pendingStyles + value.slice(marks.length);
        pendingStyles = '';
      }
      continue;
    }
    if (token.type === 'osc') {
      output += pendingStyles + token.value;
      pendingStyles = '';
      continue;
    }
    if (token.type !== 'csi' || token.finalCharacter !== 'm' || token.intermediateString !== '' || !SGR_PARAMETERS.test(token.parameterString)) continue;
    const parameters = token.parameterString
      .split(';')
      .map((parameter) => normalizeParameter(parameter))
      .filter((parameter) => parameter !== undefined);
    if (parameters.length > 0) pendingStyles += sgr(parameters.join(';'));
  }
  return output + pendingStyles;
}

// ── The styled-cell grid (`@alcalzone/ansi-tokenize` 0.3) ──────────────────────────────

/** One SGR (or OSC 8 link) code, and the code that ends it. */
export interface Code {
  code: string;
  end: string;
}

export interface StyledChar {
  value: string;
  fullWidth: boolean;
  styles: Code[];
}

const RESET = sgr(0);

/** OSC 8's opening and closing halves, cut from paratext's one record of the sequence. */
const [LINK_HEAD, LINK_TAIL] = LINK.encode.split('{text}') as [string, string];
const LINK_PREFIX = LINK_HEAD.slice(0, LINK_HEAD.indexOf(';') + 1);
/** `ESC ] 8 ; ;` — the close, before whichever terminator its opener used. */
const LINK_CLOSE = LINK_TAIL.slice(0, -1);
const STRING_TERMINATOR = `${ESC}\\`;
const LINK_ENDS = new Set([LINK_CLOSE + BEL, LINK_CLOSE + STRING_TERMINATOR, LINK_CLOSE + ST]);

/** ansi-styles' pairs, start → end. */
const PAIRS = new Map<number, number>([
  [0, 0],
  [1, 22],
  [2, 22],
  [3, 23],
  [4, 24],
  [53, 55],
  [7, 27],
  [8, 28],
  [9, 29],
  ...[30, 31, 32, 33, 34, 35, 36, 37, 90, 91, 92, 93, 94, 95, 96, 97].map((n): [number, number] => [n, 39]),
  ...[40, 41, 42, 43, 44, 45, 46, 47, 100, 101, 102, 103, 104, 105, 106, 107].map((n): [number, number] => [n, 49]),
]);
const END_CODES = new Set([...[...PAIRS.values()].map((n) => sgr(n)), ...LINK_ENDS]);

/** The parameters of an SGR code: what sits between its introducer and its `m`. */
const parametersOf = (sgrCode: string): string => sgrCode.slice(2, -1);

function endOf(codeString: string): string {
  if (END_CODES.has(codeString)) return codeString;
  if (codeString.startsWith(LINK_PREFIX)) {
    if (codeString.endsWith(STRING_TERMINATOR)) return LINK_CLOSE + STRING_TERMINATOR;
    if (codeString.endsWith(ST)) return LINK_CLOSE + ST;
    return LINK_CLOSE + BEL;
  }
  const body = parametersOf(codeString);
  if (body.startsWith('38')) return sgr(39);
  if (body.startsWith('48')) return sgr(49);
  const end = PAIRS.get(Number.parseInt(body, 10));
  return end === undefined ? RESET : sgr(end);
}

const isIntensity = (c: Code): boolean => c.code === sgr(1) || c.code === sgr(2);

function reduce(codes: Code[], next: Code): Code[] {
  if (next.code === RESET) return [];
  if (END_CODES.has(next.code)) return codes.filter((c) => c.end !== next.code);
  if (isIntensity(next)) return codes.some((c) => c.code === next.code && c.end === next.end) ? codes : [...codes, next];
  return [...codes.filter((c) => c.end !== next.end), next];
}

/** An SGR sequence split into its parts, keeping `38;5;n` and `38;2;r;g;b` whole. */
function splitSgr(sgrCode: string): string[] {
  if (!sgrCode.includes(';')) return [sgrCode];
  const parts = parametersOf(sgrCode).split(';');
  const out: string[] = [];
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i]!;
    if ((part === '38' || part === '48') && i + 2 < parts.length && parts[i + 1] === '5') {
      out.push(parts.slice(i, i + 3).join(';'));
      i += 2;
    } else if ((part === '38' || part === '48') && i + 4 < parts.length && parts[i + 1] === '2') {
      out.push(parts.slice(i, i + 5).join(';'));
      i += 4;
    } else {
      out.push(part);
    }
  }
  return out.map((p) => sgr(p));
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** The last index of an OSC terminator at or after `from`: BEL, C1 ST, or `ESC \`. */
function oscTerminator(text: string, from: number): number {
  for (let i = from; i < text.length; i += 1) {
    const c = text[i];
    if (c === BEL || c === ST) return i;
    if (c === ESC && text[i + 1] === '\\') return i + 1;
  }
  return -1;
}

/** Where an escape at `index` ends, with the codes it carries (none for an OSC that is not a link); `undefined` when it is not one. */
function readCode(text: string, index: number): { end: number; codes: string[] } | undefined {
  const next = text[index + 1];
  if (next === ']') {
    if (text.startsWith(LINK_PREFIX.slice(1), index + 1)) {
      const params = text.indexOf(';', index + LINK_PREFIX.length);
      if (params !== -1) {
        const end = oscTerminator(text, params + 1);
        if (end !== -1) return { end: end + 1, codes: [text.slice(index, end + 1)] };
      }
    }
    const end = oscTerminator(text, index + 2);
    return end === -1 ? undefined : { end: end + 1, codes: [] };
  }
  if (next !== '[') return undefined;
  let at = index + 2;
  while (at < text.length && (text[at] === ';' || inRange(text[at], 0x30, 0x39))) at += 1;
  if (text[at] !== 'm') return undefined;
  return { end: at + 1, codes: splitSgr(text.slice(index, at + 1)) };
}

/** A line as cells, each carrying the styles in force when it was written. */
export function styledChars(line: string): StyledChar[] {
  const out: StyledChar[] = [];
  let styles: Code[] = [];
  let skipUntil = 0;
  for (const { segment, index } of segmenter.segment(line)) {
    if (index < skipUntil) continue;
    const first = segment[0];
    if (first === ESC || first === C1_CSI) {
      const read = readCode(line, index);
      if (read !== undefined) {
        for (const c of read.codes) styles = reduce(styles, { code: c, end: endOf(c) });
        skipUntil = read.end;
        continue;
      }
    }
    out.push({ value: segment, fullWidth: false, styles });
  }
  return out;
}

function undo(codes: Code[]): Code[] {
  return codes
    .reduce<Code[]>(reduce, [])
    .reverse()
    .map((c) => ({ code: c.end, end: c.end }));
}

/** The fewest codes that turn `from` into `to`. */
function diff(from: Code[], to: Code[]): Code[] {
  const endsInTo = new Set(to.map((c) => c.end));
  const startsInTo = new Set(to.map((c) => c.code));
  const startsInFrom = new Set(from.map((c) => c.code));
  return [...undo(from.filter((c) => (isIntensity(c) ? !startsInTo.has(c.code) : !endsInTo.has(c.end)))), ...to.filter((c) => !startsInFrom.has(c.code))];
}

const join = (codes: Code[]): string => [...new Set(codes.map((c) => c.code))].join('');

/** A row of cells back to a string, opening and closing styles only where they change. */
export function serialize(chars: readonly StyledChar[]): string {
  let out = '';
  for (const [i, char] of chars.entries()) {
    out += join(i === 0 ? char.styles : diff(chars[i - 1]!.styles, char.styles));
    out += char.value;
    if (i === chars.length - 1) out += join(diff(char.styles, []));
  }
  return out;
}

/** Every SGR code in `text`, with where it starts: what line-update replays. */
export function sgrCodes(text: string): { index: number; value: string }[] {
  const found: { index: number; value: string }[] = [];
  for (let index = text.indexOf(ESC); index !== -1; index = text.indexOf(ESC, index + 1)) {
    if (text[index + 1] !== '[') continue;
    let at = index + 2;
    while (at < text.length && (text[at] === ';' || inRange(text[at], 0x30, 0x39))) at += 1;
    if (text[at] === 'm') found.push({ index, value: text.slice(index, at + 1) });
  }
  return found;
}

/** `text` with its SGR codes removed. */
export function stripSgr(text: string): string {
  let out = '';
  let from = 0;
  for (const { index, value } of sgrCodes(text)) {
    out += text.slice(from, index);
    from = index + value.length;
  }
  return out + text.slice(from);
}
