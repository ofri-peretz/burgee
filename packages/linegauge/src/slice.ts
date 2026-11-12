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
 * to it, so the text after it stays text. That grammar is `slice-ansi` 10's `tokenize-ansi.js`,
 * whose suite grades this file; the columns are this package's own `measure`.
 *
 * Built on the same style stack `wrap` uses rather than a second copy of it, which is the
 * whole consolidation: `slice-ansi` and `wrap-ansi` each carry their own, and they disagree.
 */
import { applyParameters, applyToken, closingSequence, segmenter, sgrTokens, type ActiveStyle } from './style.js';
import { clusterColumns, plainAscii } from './width.js';

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
/** The open link, whether it has wrapped text, and where its opener sits in the output. */
interface LinkState {
  link: Link | undefined;
  linked: boolean;
  linkAt: number;
}
type Token = Escape | Text;

// Stryker disable next-line StringLiteral: the walk handles every kind it does not name as a control, so the tag is never compared
const control = (code: string): Control => ({ kind: 'control', code });

/**
 * `OSC 8 ; params ; URI ST`, in either introducer, ended by `BEL`, `ESC \` or `U+009C`. The
 * URI's `;` is looked for before the terminator and never past it, as slice-ansi 10.0.1 does: a
 * link with none is an ordinary OSC, left to `parseControlString` (burgee#1515).
 */
function parseLink(string: string, index: number): Escape | undefined {
  const prefix = LINK_PREFIXES.find((candidate) => string.startsWith(candidate, index));
  if (prefix === undefined) return undefined;
  let uri = -1;
  // Stryker disable next-line EqualityOperator: past the end there is no terminator, and the unterminated link is taken whole either way
  for (let at = index + prefix.length; at < string.length; at += 1) {
    const terminator = string[at] === BELL || string[at] === C1_ST ? string[at] : string.startsWith(ST, at) ? ST : undefined;
    if (terminator !== undefined) {
      if (uri === -1) return undefined;
      return { kind: 'link', code: string.slice(index, at + terminator.length), open: at !== uri + 1, close: `${prefix};${terminator}` };
    }
    if (uri === -1 && string[at] === ';') uri = at;
  }
  return control(string.slice(index));
}

/** `OSC`, `DCS`, `SOS`, `PM`, `APC` and a lone `ST`: opaque, zero columns, ended by `ST`. */
function parseControlString(string: string, index: number): Escape | undefined {
  const first = string[index] as string;
  let body: number;
  // Stryker disable next-line BooleanLiteral: both branches that reach the scan assign it first
  let bell = false;
  if (first === ESC) {
    // Stryker disable next-line StringLiteral: any fallback that is not a command byte is refused the same way as the empty one
    const command = string[index + 1] ?? '';
    if (command === '\\') return control(ST);
    if (!STRING_COMMANDS.has(command)) return undefined;
    body = index + 2;
    bell = command === ']';
  } else if (first === C1_ST) {
    return control(C1_ST);
  } else if (first === C1_OSC || C1_STRINGS.has(first)) {
    // Stryker disable next-line NumericLiteral: starting on the introducer itself finds no terminator there — it is neither BEL nor ST
    body = index + 1;
    bell = first === C1_OSC;
  } else {
    return undefined;
  }
  // Stryker disable next-line EqualityOperator: past the end there is no terminator, and the unterminated string is taken whole either way
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
  // Stryker disable next-line EqualityOperator: one more pass reads undefined, which ends the sequence at the end of the string — the same control the fall-through returns
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

/** An escape as the walk meets it, with whether the next code point continues a cluster. */
type Placed = Escape & { ahead: boolean };

/** Every character that can begin a sequence this reads — `ESC` and the C1 introducers. */
const INTRODUCER = /[\u001B\u0090\u0098\u009B-\u009F]/g;

/**
 * Escapes and code points, in order, with each code point's columns filled in from the
 * **visible** text's clusters — escapes set aside first, so a style between a base and its
 * mark cannot make them two clusters (rule 2).
 *
 * **Visited one cluster at a time, so a slice stops where it ends** (B5). This used to build a
 * token object for every code point of the whole input and segment all of it before the walk
 * below looked at the first one — 7.7× slice-ansi on a 12-column cut of an ordinary line. Now
 * the input is cut into escapes and text runs once, and each cluster's tokens — with the escapes
 * before and inside it — go to `visit` in turn: when `visit` answers that the cut is made, at
 * the first cluster past `end`, nothing after it is segmented or measured. A run's code points are its
 * string iterator's, which is `codePointAt` walking the input, as it was — an introducer is
 * never half of a surrogate pair, so a run boundary never splits one.
 */
function walk(string: string, visit: (token: Text | Placed) => boolean): void {
  const parts: (Escape | string)[] = [];
  let text = '';
  for (let index = 0, from = 0; index <= string.length; ) {
    INTRODUCER.lastIndex = index;
    const at = INTRODUCER.exec(string)?.index ?? string.length;
    // Stryker disable next-line EqualityOperator,ConditionalExpression: at the end of the string every parser finds nothing and answers undefined
    const escape = at < string.length ? parseEscape(string, at) : undefined;
    // An introducer nothing parses from is a character like any other.
    if (at < string.length && escape === undefined) {
      index = at + 1;
      continue;
    }
    const run = string.slice(from, at);
    // Stryker disable next-line ConditionalExpression,StringLiteral: an empty run yields no code points, so `unit` steps over it
    if (run !== '') parts.push(run);
    text += run;
    if (escape === undefined) break;
    parts.push(escape);
    index = from = at + escape.code.length;
  }
  const clusters = plainAscii(text) ? undefined : segmenter().segment(text)[Symbol.iterator]();
  let part = 0;
  let run: Iterator<string> | undefined;
  /** The next escape or code point, or `undefined` past the end. */
  const unit = (): Escape | string | undefined => {
    for (;;) {
      const point = run?.next();
      if (point?.done === false) return point.value;
      const current = parts[part++];
      if (typeof current !== 'string') return current;
      run = current[Symbol.iterator]();
    }
  };
  let next = unit();
  /**
   * Escapes up to the next code point, told whether that code point continues a cluster. What
   * `visit` answers for one is not asked: only a cluster can be the one past `end`.
   */
  const escapes = (ahead: boolean): void => {
    for (; next !== undefined && typeof next !== 'string'; next = unit()) visit({ ...next, ahead });
  };
  // Stryker disable next-line BooleanLiteral: before the first code point nothing is past the end — the first column is 0 and `end` is above it or nothing is taken
  for (escapes(false); next !== undefined; escapes(false)) {
    // Printable ASCII is one column and one cluster per character — the common case never
    // builds the segmenter, which is the import-time saving `style.ts` records. Past the last
    // cluster, a code point stands alone at one column: a lone surrogate before an escape and its
    // partner after it are two units here and one code point to the segmenter.
    const cluster = clusters?.next();
    const whole = cluster?.done === false;
    const segment = whole ? cluster.value.segment : (next as string);
    // A cluster's columns are `width`'s, as slice-ansi 10 takes string-width's (`counts columns
    // the same way as string-width`): CRLF and every other cluster that draws nothing are 0, a
    // lone regional indicator is 1. slice-ansi 9 counted each at least one position and a lone
    // indicator two, and `positions()` here followed it until 2026-11-01 (burgee#1392).
    const columns = whole ? clusterColumns(segment) : 1;
    // The clusters partition the visible text, and the units are taken until they cover the
    // cluster's code units rather than one per code point of it: a style between the two halves
    // of a surrogate pair makes them two units and one code point (slice-ansi 10.0.1,
    // `keeps UTF-16 offsets when ANSI separates surrogate halves`).
    for (let covered = 0; covered < segment.length; ) {
      // Stryker disable next-line ConditionalExpression,EqualityOperator: at the first code point of a cluster the escapes before it were already visited, so the call finds none
      if (covered > 0) escapes(true);
      const value = next as string;
      if (visit({ kind: 'text', value, columns: covered === 0 ? columns : 0, continuation: covered > 0 })) return;
      next = unit();
      covered += value.length;
    }
  }
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
  let active: ActiveStyle[] = [];
  // The open hyperlink, whether it has wrapped visible text yet, and where its opener sits in
  // `body` when it was emitted — an empty link is taken back out (rule 4).
  let link: Link | undefined;
  // Stryker disable next-line BooleanLiteral: read only while a link is open, and opening one sets it
  let linked = false;
  // Stryker disable next-line NumericLiteral: read only while a link is open, and opening one sets it
  let linkAt = 0;
  // Where the latest run of openers with no text after it began, and the stack and the link
  // before it: a cut that takes the openers back takes back what the links did after them too.
  let pendingAt: number | undefined;
  let pendingActive = active;
  let pendingLink: LinkState | undefined;
  let column = 0;
  // Stryker disable next-line StringLiteral: replaced when the slice starts, and returned only after it has
  let body = '';
  let started = false;

  const forgetLink = (): void => {
    link = undefined;
    // Stryker disable next-line BooleanLiteral: with no link open nothing reads it, and the next link to open sets it
    linked = false;
  };
  // Only ever handed the open link, and only when it has wrapped nothing. Before the slice
  // starts `body` is empty and `linkAt` is 0, so there it removes nothing, without a branch.
  const discardLink = (open: Link): void => {
    const length = open.code.length;
    body = body.slice(0, linkAt) + body.slice(linkAt + length);
    // Stryker disable next-line EqualityOperator,ConditionalExpression: an opener and a link are never recorded at the same offset — each one written moves `body` on — and `undefined > linkAt` is false, so the first check only names the case
    if (pendingAt !== undefined && pendingAt > linkAt) pendingAt -= length;
    // The opener is gone from `body`, so a rollback must not restore a link that points at it.
    if (pendingLink?.link === open) pendingLink = undefined;
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
    if (opens && pendingAt === undefined) {
      pendingAt = body.length;
      pendingActive = [...active];
      pendingLink = { link, linked, linkAt };
    }
    const before = new Set(active);
    applyParameters(token.parameters, active);
    // A one-character introducer is the C1 `CSI`; `ESC [` is two.
    // Stryker disable next-line ConditionalExpression: giving an `ESC [` style its own introducer is what reopening it without one does
    if (token.prefix.length === 1) {
      for (const style of active) if (!before.has(style)) style.prefix = token.prefix;
    }
    // Stryker disable next-line ConditionalExpression: before the slice starts `body` is replaced, not returned
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
    } else if (link !== undefined && !linked) {
      discardLink(link);
      return;
    } else {
      forgetLink();
    }
    // Stryker disable next-line ConditionalExpression: before the slice starts `body` is replaced, not returned
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
    // Stryker disable next-line ConditionalExpression: before the slice starts `body` is replaced, not returned, and the first text in range starts it
    if (started) {
      body += token.value;
      pendingAt = undefined;
      // Stryker disable next-line ConditionalExpression: with no link open nothing reads it, and the next link to open clears it
      if (link !== undefined) linked = true;
    }
    column += token.columns;
  };

  walk(string, (token) => {
    const cluster = token.kind === 'text' && !token.continuation;
    let pastEnd = column >= end || (cluster && column + token.columns > end);
    // An escape inside a cluster that is still being emitted belongs to that cluster.
    if ((token as Placed).ahead) pastEnd = false;
    if (pastEnd && cluster) {
      // Rule 1: stop at the first cluster that would overrun. Openers that styled nothing are
      // taken back out here, and a link that wrapped nothing by `settleLink` below, so the
      // fragment ends on its text.
      if (pendingAt !== undefined) {
        body = body.slice(0, pendingAt);
        active = pendingActive;
        link = pendingLink?.link;
        if (link !== undefined) ({ linked, linkAt } = pendingLink as LinkState);
      }
      return true;
    }
    if (token.kind === 'sgr') takeSgr(token, pastEnd);
    else if (token.kind === 'link') takeLink(token, pastEnd);
    else if (token.kind === 'text') takeText(token);
    else if (!pastEnd && started) body += token.code;
    return false;
  });

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
