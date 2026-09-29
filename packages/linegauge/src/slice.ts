/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * R4 — cut a styled string in **display columns**, never in code units.
 *
 * `"\u001B[31mred\u001B[39m".slice(0, 3)` returns three characters of an escape sequence
 * and no red at all; that is the bug this exists to remove, and it is the same bug in every
 * hand-rolled column-cutter. Four rules, none of which a code-unit slice can honour:
 *
 *   1. **Never split a grapheme cluster — and never return more columns than were asked
 *      for.** A cluster that straddles either edge is left out whole: half a wide character
 *      is not printable, and a slice is how a caller makes text *fit*. This used to round
 *      outward, and `truncate` — which is a slice plus an ellipsis — returned `あい…`, five
 *      columns, when asked for four. `slice-ansi` rounds inward and its 9.x suite grades it
 *      (`does not exceed endSlice for wide characters`).
 *   2. **A cluster is a cluster even when a style sits inside it.** `ESC[31me ESC[39m U+0301`
 *      is one `é` on screen, so the escapes are set aside, the *visible* text is segmented,
 *      and the escape rides with the cluster it interrupts.
 *   3. **Close what is open at the cut, and reopen it at the start.** A style opened before
 *      `start` is re-emitted at the front of the result, because the caller is going to print
 *      this fragment somewhere the opener never reached. A close that lands just after `end`
 *      is kept as written rather than synthesised, and an opener with no text after it is
 *      dropped, so a slice carries no style that styles nothing.
 *   4. **A hyperlink is a style too** (`OSC 8`), with no nesting: a second open replaces the
 *      first, which is closed with its own introducer and terminator. A link around no
 *      visible text is removed rather than emitted empty.
 *
 * Every escape this does not interpret — any other `CSI`, `OSC`, `DCS`, `SOS`, `PM`, `APC`,
 * in `ESC` or C1 form, terminated by `BEL`, `ESC \` or `U+009C`, or unterminated — is carried
 * through as a zero-width unit, and a malformed one ends at the first byte that cannot belong
 * to it, so the text after it stays text. That grammar is `slice-ansi` 9's `tokenize-ansi.js`,
 * whose suite grades this file; the columns are this package's own `measure`.
 *
 * Built on the same style stack `wrap` uses rather than a second copy of it, which is the
 * whole consolidation: `slice-ansi` and `wrap-ansi` each carry their own, and they disagree.
 */
import { applyParameters, applyToken, ASCII_PRINTABLE, closingSequence, segmenter, sgrTokens, type ActiveStyle } from './style.js';
import { measure } from './width.js';

const ESC = '\u001B';
const BELL = '\u0007';
const C1_DCS = '\u0090';
const C1_SOS = '\u0098';
const C1_CSI = '\u009B';
const C1_ST = '\u009C';
const C1_OSC = '\u009D';
const C1_PM = '\u009E';
const C1_APC = '\u009F';
const ST = `${ESC}\\`;
const ESC_CSI = `${ESC}[`;
const LINK_PREFIXES = [`${ESC}]8;`, `${C1_OSC}8;`] as const;
/** Every character that can begin a sequence this reads. */
const INTRODUCERS = new Set([ESC, C1_DCS, C1_SOS, C1_CSI, C1_ST, C1_OSC, C1_PM, C1_APC]);
/** The control strings: `ESC` + the second byte, or its C1 form. `OSC` alone also ends at `BEL`. */
const STRING_COMMANDS = new Set([']', 'P', 'X', '^', '_']);
const C1_STRINGS = new Set([C1_DCS, C1_SOS, C1_PM, C1_APC]);

/** ECMA-48 `CSI`: parameter bytes `0`–`?`, intermediates space–`/`, one final `@`–`~`. */
const CSI_PARAMETER = /[0-?]/u;
const CSI_INTERMEDIATE = /[ -/]/u;
const CSI_FINAL = /[@-~]/u;
/** The parameter bytes an SGR may carry and still be read as one. `ESC[?25m` is not an SGR. */
const SGR_PARAMETER = /[\d:;]/u;

interface Sgr {
  kind: 'sgr';
  code: string;
  prefix: string;
  parameters: string;
}
interface Link {
  kind: 'link';
  code: string;
  open: boolean;
  /** The sequence that closes this link — its own introducer and its own terminator. */
  close: string;
}
interface Control {
  kind: 'control';
  code: string;
}
interface Text {
  kind: 'text';
  /** One code point. A cluster is its first code point plus continuations. */
  value: string;
  columns: number;
  continuation: boolean;
}
type Escape = Sgr | Link | Control;
type Token = Escape | Text;

const control = (code: string): Control => ({ kind: 'control', code });

/** `OSC 8 ; params ; URI ST`, in either introducer, ended by `BEL`, `ESC \` or `U+009C`. */
function parseLink(string: string, index: number): Escape | undefined {
  const prefix = LINK_PREFIXES.find((candidate) => string.startsWith(candidate, index));
  if (prefix === undefined) return undefined;
  const uri = string.indexOf(';', index + prefix.length);
  if (uri === -1) return control(string.slice(index));
  for (let at = uri + 1; at < string.length; at += 1) {
    const terminator = string[at] === BELL || string[at] === C1_ST ? string[at] : string.startsWith(ST, at) ? ST : undefined;
    if (terminator !== undefined) {
      return { kind: 'link', code: string.slice(index, at + terminator.length), open: at !== uri + 1, close: `${prefix};${terminator}` };
    }
  }
  return control(string.slice(index));
}

/** `OSC`, `DCS`, `SOS`, `PM`, `APC` and a lone `ST`: opaque, zero columns, ended by `ST`. */
function parseControlString(string: string, index: number): Escape | undefined {
  const first = string[index] as string;
  let body: number;
  let bell = false;
  if (first === ESC) {
    const command = string[index + 1] ?? '';
    if (command === '\\') return control(ST);
    if (!STRING_COMMANDS.has(command)) return undefined;
    body = index + 2;
    bell = command === ']';
  } else if (first === C1_ST) {
    return control(C1_ST);
  } else if (first === C1_OSC || C1_STRINGS.has(first)) {
    body = index + 1;
    bell = first === C1_OSC;
  } else {
    return undefined;
  }
  for (let at = body; at < string.length; at += 1) {
    if ((bell && string[at] === BELL) || string[at] === C1_ST) return control(string.slice(index, at + 1));
    if (string.startsWith(ST, at)) return control(string.slice(index, at + ST.length));
  }
  return control(string.slice(index));
}

/** `CSI … final`. An SGR is `m` over digits, `;` and `:` only; anything else is opaque. */
function parseCsi(string: string, index: number): Escape | undefined {
  let prefix: string;
  if (string.startsWith(ESC_CSI, index)) prefix = ESC_CSI;
  else if (string[index] === C1_CSI) prefix = C1_CSI;
  else return undefined;
  let canonical = true;
  for (let at = index + prefix.length; at < string.length; at += 1) {
    const character = string[at] as string;
    if (CSI_FINAL.test(character)) {
      const code = string.slice(index, at + 1);
      if (character !== 'm' || !canonical) return control(code);
      return { kind: 'sgr', code, prefix, parameters: string.slice(index + prefix.length, at) };
    }
    if (CSI_PARAMETER.test(character)) {
      canonical &&= SGR_PARAMETER.test(character);
      continue;
    }
    if (CSI_INTERMEDIATE.test(character)) {
      canonical = false;
      continue;
    }
    // A byte no CSI can contain ends the sequence *before* it, so `ESC[31ĀA` is a control
    // and then two characters — not one long sequence that swallows the text.
    return control(string.slice(index, at));
  }
  return control(string.slice(index));
}

function parseEscape(string: string, index: number): Escape | undefined {
  return parseLink(string, index) ?? parseControlString(string, index) ?? parseCsi(string, index);
}

/** A lone regional indicator — half a flag, with no partner to make it one. */
const LONE_REGIONAL_INDICATOR = /^[\u{1F1E6}-\u{1F1FF}]$/u;

/**
 * How many positions a cluster occupies **for cutting**, which is `measure`'s answer with
 * two exceptions, both slice-ansi's. Every cluster is at least one position, so CRLF, a
 * control or a zero-width character can be the start or end of a range the way a character
 * can, and a lone regional indicator is two, like the flag it is half of. `width` still says
 * 0 and 1 for those, as string-width does. The two diverge only on clusters that render as
 * nothing, where a cut has to land somewhere anyway. With `measure` alone this was 102 / 104
 * against slice-ansi 9's suite, and not level (burgee#317).
 */
function positions(cluster: string): number {
  const columns = measure(cluster);
  if (columns === 0) return 1;
  return LONE_REGIONAL_INDICATOR.test(cluster) ? 2 : columns;
}

/**
 * Escapes and code points, in order, with each code point's columns filled in from the
 * **visible** text's clusters — escapes set aside first, so a style between a base and its
 * mark cannot make them two clusters (rule 2).
 */
function tokenize(string: string): Token[] {
  const tokens: Token[] = [];
  const visible: Text[] = [];
  let text = '';
  let index = 0;
  while (index < string.length) {
    const escape = INTRODUCERS.has(string[index] as string) ? parseEscape(string, index) : undefined;
    if (escape) {
      tokens.push(escape);
      index += escape.code.length;
      continue;
    }
    const value = String.fromCodePoint(string.codePointAt(index) as number);
    const token: Text = { kind: 'text', value, columns: 1, continuation: false };
    tokens.push(token);
    visible.push(token);
    text += value;
    index += value.length;
  }
  // Printable ASCII is one column and one cluster per character — the common case never
  // builds the segmenter, which is the import-time saving `style.ts` records.
  if (ASCII_PRINTABLE.test(text)) return tokens;
  let at = 0;
  for (const { segment } of segmenter().segment(text)) {
    const points = [...segment].length;
    const columns = positions(segment);
    for (let offset = 0; offset < points; offset += 1) {
      // The segments partition `text`, which is the visible tokens joined, so one is always there.
      const token = visible[at + offset] as Text;
      token.columns = offset === 0 ? columns : 0;
      token.continuation = offset > 0;
    }
    at += points;
  }
  return tokens;
}

/** Whether an SGR opens anything — a code that pushes onto an empty stack. */
function opensStyle(parameters: string): boolean {
  return sgrTokens(parameters).some((token) => {
    const probe: ActiveStyle[] = [];
    applyToken(token, probe);
    return probe.length > 0;
  });
}

/** Whether an SGR removes something that is open now. */
function closesStyle(parameters: string, active: ActiveStyle[]): boolean {
  const after = [...active];
  applyParameters(parameters, after);
  return active.some((style) => !after.includes(style));
}

/** For each token, whether the next code point after it continues a cluster. */
function continuationAhead(tokens: Token[]): boolean[] {
  const ahead: boolean[] = [];
  let next = false;
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    ahead[index] = next;
    const token = tokens[index];
    if (token?.kind === 'text') next = token.continuation;
  }
  return ahead;
}

/**
 * `[start, end)` in display columns. A negative or reversed range is empty rather than an
 * error, matching `String.prototype.slice`'s temperament if not its units.
 *
 * The walk's state is locals of this function rather than fields of an object, and that is
 * measured, not taste: a minifier renames a local and cannot touch a property name, and the
 * object form — `cut.pendingAt`, `cut.linkAt` and eight more, each spelled out on every use —
 * cost the bundled `linegauge/slice` more than this does (see `ceilings.json`).
 */
export function slice(string: string, start = 0, end = Number.POSITIVE_INFINITY): string {
  if (end <= start || string.length === 0) return '';
  const tokens = tokenize(string);
  const ahead = continuationAhead(tokens);
  let active: ActiveStyle[] = [];
  // The open hyperlink, whether it has wrapped visible text yet, and where its opener sits in
  // `body` when it was emitted — an empty link is taken back out (rule 4).
  let link: Link | undefined;
  let linked = false;
  let linkAt = 0;
  // Where the latest run of openers with no text after it began, and the stack before it.
  let pendingAt: number | undefined;
  let pendingActive = active;
  let column = 0;
  let body = '';
  let started = false;

  const forgetLink = (): void => {
    link = undefined;
    linked = false;
  };
  // Only ever handed the open link, and only when it has wrapped nothing. Before the slice
  // starts `body` is empty and `linkAt` is 0, so there it removes nothing, without a branch.
  const discardLink = (open: Link): void => {
    const length = open.code.length;
    body = body.slice(0, linkAt) + body.slice(linkAt + length);
    if (pendingAt !== undefined && pendingAt > linkAt) pendingAt -= length;
    forgetLink();
  };
  const settleLink = (open: Link): void => {
    if (linked) body += open.close;
    else discardLink(open);
  };

  const takeSgr = (token: Sgr, pastEnd: boolean): void => {
    const opens = opensStyle(token.parameters);
    // Past the end, only a sequence that purely closes something open is kept, as written.
    if (pastEnd && (opens || !closesStyle(token.parameters, active))) return;
    if (started && opens && pendingAt === undefined) {
      pendingAt = body.length;
      pendingActive = [...active];
    }
    const before = new Set(active);
    applyParameters(token.parameters, active);
    // A one-character introducer is the C1 `CSI`; `ESC [` is two.
    if (token.prefix.length === 1) {
      for (const style of active) if (!before.has(style)) style.prefix = token.prefix;
    }
    if (started) body += token.code;
  };

  const takeLink = (token: Link, pastEnd: boolean): void => {
    if (pastEnd && (token.open || link === undefined)) return;
    if (token.open) {
      // OSC 8 does not nest: a new open replaces the link, so the old one is settled first.
      if (link !== undefined) settleLink(link);
      link = token;
      linked = false;
      linkAt = body.length;
    } else if (started && link !== undefined && !linked) {
      discardLink(link);
      return;
    } else {
      forgetLink();
    }
    if (started) body += token.code;
  };

  const takeText = (token: Text): void => {
    if (!started && column >= start && !token.continuation) {
      started = true;
      body = active.map((style) => `${style.prefix ?? ESC_CSI}${style.open}m`).join('');
      if (link !== undefined) {
        linkAt = body.length;
        body += link.code;
      }
    }
    if (started) {
      body += token.value;
      pendingAt = undefined;
      if (link !== undefined) linked = true;
    }
    column += token.columns;
  };

  for (const [index, token] of tokens.entries()) {
    const cluster = token.kind === 'text' && !token.continuation;
    let pastEnd = column >= end || (cluster && column + token.columns > end);
    // An escape inside a cluster that is still being emitted belongs to that cluster.
    if (pastEnd && token.kind !== 'text' && ahead[index] === true) pastEnd = false;
    if (pastEnd && cluster) {
      // Rule 1: stop at the first cluster that would overrun. Openers that styled nothing are
      // taken back out here, and a link that wrapped nothing by `settleLink` below, so the
      // fragment ends on its text.
      if (pendingAt !== undefined) {
        body = body.slice(0, pendingAt);
        active = pendingActive;
      }
      break;
    }
    if (token.kind === 'sgr') takeSgr(token, pastEnd);
    else if (token.kind === 'link') takeLink(token, pastEnd);
    else if (token.kind === 'text') takeText(token);
    else if (!pastEnd && started) body += token.code;
  }

  if (!started) return '';
  if (link !== undefined) settleLink(link);
  return body + closingSequence(active);
}

/**
 * The default export, for the reason `strip.ts` gives at length: `slice-ansi`'s suite
 * imports its entry point's **default**, and that suite now grades this file.
 *
 * The specifier is described rather than quoted on purpose — see the note on `wrap`'s
 * default: `subpath-isolation.test.ts` reads the emitted text, comments and all.
 */
// eslint-disable-next-line import-next/no-default-export -- the incumbent's own suite imports a default; see above. This is the drop-in surface, not a style choice.
export { slice as default };
