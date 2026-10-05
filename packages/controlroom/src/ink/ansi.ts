/**
 * The two pieces of ANSI handling Ink's output grid needs, reproduced because Ink's suite
 * compares their bytes: `sanitize`, which keeps a text node's colours and links and drops
 * every sequence that would move the cursor out from under the layout, and the styled-cell
 * grid's tokenizer and serializer, which re-emit a row with the fewest SGR changes between
 * neighbouring cells (what `@alcalzone/ansi-tokenize` does for Ink). Widths are linegauge's.
 *
 * No sequence is written to a stream here; these are strings in and strings out.
 */
import { width } from 'linegauge';
import { LINK } from 'paratext/link';
import { painter, UNPAINTED } from 'roundel/tokens';

const ESC = '\u001B';
const BEL = '\u0007';
const ST = '\u009C';
const C1_CSI = '\u009B';

const inRange = (character: string | undefined, low: number, high: number): boolean => {
  const code = character?.codePointAt(0);
  return code !== undefined && code >= low && code <= high;
};
const isParameter = (c: string | undefined): boolean => inRange(c, 0x30, 0x3f);
const isIntermediate = (c: string | undefined): boolean => inRange(c, 0x20, 0x2f);
const isC1 = (c: string | undefined): boolean => inRange(c, 0x80, 0x9f);

interface Csi {
  end: number;
  parameters: string;
  intermediates: string;
  final: string;
}

function readCsi(text: string, from: number): Csi | undefined {
  let index = from;
  while (isParameter(text[index])) index += 1;
  const parameters = text.slice(from, index);
  const intermediateStart = index;
  while (isIntermediate(text[index])) index += 1;
  const final = text[index];
  if (!inRange(final, 0x40, 0x7e)) return undefined;
  return { end: index + 1, parameters, intermediates: text.slice(intermediateStart, index), final: final! };
}

/** Where a control string (OSC, DCS, PM, APC, SOS) ends, or `undefined` when it never does. */
function controlStringEnd(text: string, from: number, bell: boolean): number | undefined {
  for (let index = from; index < text.length; index += 1) {
    const c = text[index];
    if ((bell && c === BEL) || c === ST) return index + 1;
    if (c === ESC) {
      if (text[index + 1] === ESC) index += 1;
      else if (text[index + 1] === '\\') return index + 2;
    }
  }
  return undefined;
}

const ESCAPE_STRINGS: Readonly<Record<string, boolean>> = { ']': true, P: false, '^': false, _: false, X: false };
const C1_STRINGS: Readonly<Record<string, boolean>> = { '\u009D': true, '\u0090': false, '\u009E': false, '\u009F': false, '\u0098': false };
const SGR_PARAMETERS = /^[\d:;]*$/u;

/**
 * A text node's own escapes, minus everything but SGR and OSC: what Ink's `sanitizeAnsi` keeps.
 * A malformed sequence drops the rest of the string, as one unsafe unit.
 */
export function sanitize(text: string): string {
  if (!text.includes(ESC) && ![...text].some((c) => isC1(c))) return text;
  let out = '';
  let index = 0;
  while (index < text.length) {
    const c = text[index]!;
    if (c === ESC) {
      const next = text[index + 1];
      if (next === undefined) return out;
      if (next === '[') {
        const csi = readCsi(text, index + 2);
        if (csi === undefined) return out;
        if (csi.final === 'm' && csi.intermediates === '' && SGR_PARAMETERS.test(csi.parameters)) out += text.slice(index, csi.end);
        index = csi.end;
        continue;
      }
      const bell = ESCAPE_STRINGS[next];
      if (bell !== undefined) {
        const end = controlStringEnd(text, index + 2, bell);
        if (end === undefined) return out;
        if (next === ']') out += text.slice(index, end);
        index = end;
        continue;
      }
      let at = index + 1;
      while (isIntermediate(text[at])) at += 1;
      if (inRange(text[at], 0x30, 0x7e)) {
        index = at + 1;
        continue;
      }
      if (isIntermediate(next)) return out;
      index += 1;
      continue;
    }
    if (c === C1_CSI) {
      const csi = readCsi(text, index + 1);
      if (csi === undefined) return out;
      if (csi.final === 'm' && csi.intermediates === '' && SGR_PARAMETERS.test(csi.parameters)) out += text.slice(index, csi.end);
      index = csi.end;
      continue;
    }
    const bell = C1_STRINGS[c];
    if (bell !== undefined) {
      const end = controlStringEnd(text, index + 1, bell);
      if (end === undefined) return out;
      if (c === '\u009D') out += text.slice(index, end);
      index = end;
      continue;
    }
    if (!isC1(c)) out += c;
    index += 1;
  }
  return out;
}

// ── The styled-cell grid ────────────────────────────────────────────────────────────────

/** One SGR (or OSC 8 link) code, and the code that ends it. */
export interface Code {
  code: string;
  end: string;
}

export interface StyledChar {
  value: string;
  /** Columns: 2 for a wide character, 0 for the cell a wide character covers. */
  width: number;
  styles: Code[];
}

/** An SGR pair's two escapes, emitted by roundel, which is where the family spells SGR. */
const pairOf = (open: number | string, close: number | string): Code => {
  const painted = painter(UNPAINTED, { open: String(open), close: String(close) });
  return { code: painted.open, end: painted.close };
};
const sgr = (n: number | string): string => pairOf(n, n).code;
const RESET = sgr(0);

/** OSC 8's opening and closing halves, cut from paratext's one record of the sequence. */
const [LINK_HEAD, LINK_TAIL] = LINK.encode.split('{text}') as [string, string];
const LINK_PREFIX = LINK_HEAD.slice(0, LINK_HEAD.indexOf(';') + 1);
const LINK_END = LINK_TAIL;

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
const END_CODES = new Set([...PAIRS.values()].map((n) => sgr(n)));

/** The parameters of an SGR code: what sits between its introducer and its `m`. */
const parametersOf = (code: string): string => code.slice(2, -1);

function endOf(code: string): string {
  if (END_CODES.has(code)) return code;
  if (code.startsWith(LINK_PREFIX)) return LINK_END;
  const body = parametersOf(code);
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
function splitSgr(code: string): string[] {
  if (!code.includes(';')) return [code];
  const parts = parametersOf(code).split(';');
  const out: string[] = [];
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i]!;
    if ((part === '38' || part === '48') && parts[i + 1] === '5' && i + 2 < parts.length) {
      out.push(parts.slice(i, i + 3).join(';'));
      i += 2;
    } else if ((part === '38' || part === '48') && parts[i + 1] === '2' && i + 4 < parts.length) {
      out.push(parts.slice(i, i + 5).join(';'));
      i += 4;
    } else {
      out.push(part);
    }
  }
  return out.map((p) => sgr(p));
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Where an escape at `index` ends, with the codes it carries; `undefined` when it is not one. */
function readCode(text: string, index: number): { end: number; codes: string[] } | undefined {
  if (text[index + 1] === ']') {
    if (!text.startsWith(LINK_PREFIX.slice(1), index + 1)) return undefined;
    const params = text.indexOf(';', index + LINK_PREFIX.length);
    if (params === -1) return undefined;
    const end = text.indexOf(BEL, params + 1);
    if (end === -1) return undefined;
    return { end: end + 1, codes: [text.slice(index, end + 1)] };
  }
  if (text[index + 1] !== '[') return undefined;
  let at = index + 2;
  while (at < text.length && /[\d;]/u.test(text[at]!)) at += 1;
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
    if (segment.startsWith(ESC) || segment.startsWith(C1_CSI)) {
      const read = readCode(line, index);
      if (read !== undefined) {
        for (const code of read.codes) styles = reduce(styles, { code, end: endOf(code) });
        skipUntil = read.end;
        continue;
      }
    }
    out.push({ value: segment, width: Math.max(1, width(segment)), styles });
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
