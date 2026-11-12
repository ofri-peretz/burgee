/**
 * dotenv 18's `{ fast: true }` parser — the hand-written character scanner from upstream
 * #1010 and the six releases of fixes after it — ported line for line from `lib/main.js`
 * (18.0.5, `parseFast`; 18.0.8 for the unquoting at a Unicode line boundary).
 *
 * It is a second grammar, not an optimisation of the first: dotenv's own suite grades it
 * separately (`test-parse-fast.js`) and pins exactly where it differs from the regex parser,
 * so "cleaner" here would mean "different". The structure — the index arithmetic, the order
 * of the checks — is upstream's; only the names of the character codes are ours, and one
 * kind of check is left out: a bound (`i < len`) written before a `charCodeAt` whose answer
 * past the end, `NaN`, is already "no" — no whitespace, no key character, no quote. What is
 * left are the bounds that end a loop `NaN` would not.
 */

/* eslint-disable conventions/prefer-code-point -- the scanner indexes UTF-16 code units, as upstream's `charCodeAt` does: every index here is a code-unit index and the arithmetic is the port's. No character this grammar turns on is outside the BMP. */
const TAB = 9;
const LF = 10;
/** The last of TAB, LF, VT, FF: CR is in JavaScript's whitespace too, but it is normalised away before the scan. */
// Stryker disable next-line NumericLiteral: 13 would admit CR, and no CR is left by the time a character is asked about.
const FORM_FEED = 12;
const SPACE = 32;
const QUOTE_DOUBLE = 34;
const HASH = 35;
const QUOTE_SINGLE = 39;
const EQUALS = 61;
const COLON = 58;
const BACKSLASH = 92;
const BACKTICK = 96;
const LOWER_E = 101;
/** The letters of `xport`, after the `e`. */
const XPORT = [120, 112, 111, 114, 116];
const NBSP = 160;
const LINE_SEPARATOR = 8232;
const PARAGRAPH_SEPARATOR = 8233;
/** The length of `export`. */
const EXPORT_LENGTH = 6;

/**
 * dotenv's quote strip, `m`-flagged as upstream writes it: `$` matches before a U+2028 or
 * U+2029, so each segment ending at one is unquoted on its own. The regex parser in `dotenv.ts`
 * runs it on every value; the scanner, since 18.0.8, on a value that holds such a boundary.
 */
export const unquoteLines = (value: string): string => value.replace(/^(['"`])([\s\S]*)\1$/gm, '$2');

/** `[A-Za-z0-9_.-]`, as a lookup table — upstream's `KEY_CHAR`. */
// Stryker disable next-line NumericLiteral: a 257th entry would be for code 256, which is not a key character either way.
const KEY_CHAR = new Uint8Array(256);
for (let c = 48; c <= 57; c++) KEY_CHAR[c] = 1;
for (let c = 65; c <= 90; c++) KEY_CHAR[c] = 1;
for (let c = 97; c <= 122; c++) KEY_CHAR[c] = 1;
KEY_CHAR[45] = 1;
KEY_CHAR[46] = 1;
KEY_CHAR[95] = 1;

/** JavaScript whitespace, the common ASCII cases first. */
function isWhitespace(c: number): boolean {
  if (c <= SPACE) return c === SPACE || (c >= TAB && c <= FORM_FEED);
  return c === NBSP || c === 5760 || (c >= 8192 && c <= 8202) || c === LINE_SEPARATOR || c === PARAGRAPH_SEPARATOR || c === 8239 || c === 8287 || c === 12288 || c === 65279;
}

/** Line ends after CR is normalised: LF and the two Unicode separators. */
function isLineEnd(c: number): boolean {
  return c === LF || c === LINE_SEPARATOR || c === PARAGRAPH_SEPARATOR;
}

const isQuote = (c: number): boolean => c === QUOTE_SINGLE || c === QUOTE_DOUBLE || c === BACKTICK;

/** Where `export` ends if it is a prefix here, else -1; and where the key then starts. */
function exportPrefix(str: string, i: number): { exportEnd: number; next: number } {
  const none = { exportEnd: -1, next: i };
  if (str.charCodeAt(i) !== LOWER_E) return none;
  if (!XPORT.every((code, k) => str.charCodeAt(i + 1 + k) === code)) return none;
  if (!isWhitespace(str.charCodeAt(i + EXPORT_LENGTH))) return none;
  let next = i + EXPORT_LENGTH;
  while (isWhitespace(str.charCodeAt(next))) next++;
  // Without a following key, `export` is the key itself.
  return KEY_CHAR[str.charCodeAt(next)] === 1 ? { exportEnd: i + EXPORT_LENGTH, next } : none;
}

const LINE_END = /[\n\u2028\u2029]/gu;

/** The end of the line `i` is on: its LF or Unicode separator, or the end of the source. */
function lineEnd(str: string, i: number): number {
  LINE_END.lastIndex = i;
  return LINE_END.exec(str)?.index ?? str.length;
}

/** A quoted value starting at `quoteStart`, or undefined when no complete one closes there. */
function quotedValue(str: string, quoteStart: number, len: number): { value: string; end: number } | undefined {
  const quoteChar = str.charAt(quoteStart);
  let j = str.indexOf(quoteChar, quoteStart + 1);
  let closingQuote = -1;
  // Stryker disable next-line UnaryOperator,NumericLiteral: read only once `closingQuote` is set, which sets this too.
  let closingEnd = -1;
  // Stryker disable next-line UnaryOperator,NumericLiteral: `indexOf` past `quoteStart` is never 0 or 1, and a turn with `j` at -1 finds no closing quote and breaks.
  while (j !== -1) {
    // Jump between matching quotes. Backslashes are preserved, so only the character just
    // before decides whether a quote can be interior text.
    const escaped = str.charCodeAt(j - 1) === BACKSLASH;
    let end = j + 1;
    while (!isLineEnd(str.charCodeAt(end)) && isWhitespace(str.charCodeAt(end))) end++;
    if (end === len || isLineEnd(str.charCodeAt(end)) || str.charCodeAt(end) === HASH) {
      closingQuote = j;
      closingEnd = end;
    }
    // Prefer an escaped quote as interior text, but keep its closing position in case the
    // rest cannot form a quoted value. An unescaped quote ends the scan.
    if (!escaped) break;
    j = str.indexOf(quoteChar, j + 1);
  }
  if (closingQuote === -1) return undefined;
  // Upstream steps over a comment after the closing quote here. The scan goes on at its `#`
  // instead, which no key starts with, so the "no key here" step skips the comment just the same.
  return { value: str.slice(quoteStart + 1, closingQuote), end: closingEnd };
}

/**
 * An unquoted value from `rawStart`: up to a comment or the line end, trimmed, one pair of
 * matching quotes unwrapped. The comment is looked for on this line only — upstream's bound
 * (18.0.5, "Bound fast parser comment scans to the current line"), which it takes past 4,096
 * characters and here always, as the answer is the same. `trim()` is the scanner's whitespace:
 * JavaScript's, which the table test holds `isWhitespace` to.
 */
function unquotedValue(str: string, rawStart: number, len: number): { value: string; end: number } {
  let nl = str.indexOf('\n', rawStart);
  if (nl === -1) nl = len;
  const line = str.slice(rawStart, nl);
  const hash = line.includes('#') ? rawStart + line.indexOf('#') : nl;
  let value = str.slice(rawStart, hash).trim();
  const first = value.charCodeAt(0);
  // dotenv 18.0.8 (#1073): a value holding a Unicode line boundary is unquoted segment by
  // segment, as the regex parser does, rather than by its first and last characters alone.
  // Stryker disable next-line ConditionalExpression,Regex: equivalent, both branches unquote a one-line value alike (D-20261019-revendor-execa-dotenv-lilconfig)
  if (/[\u2028\u2029]/u.test(value)) {
    value = unquoteLines(value);
  } else if (value.length > 1 && isQuote(first) && value.charCodeAt(value.length - 1) === first) {
    value = value.slice(1, -1);
  }
  // Unquoted values include Unicode separators, but comments do not. The scan goes on at the
  // comment's `#`, which the "no key here" step skips to the end of its line.
  return { value, end: hash };
}

/** Every `KEY=value` in `src`, by the scanner. Keys land in a Map first, so `__proto__` is an entry. */
export function parseFast(src: string | Buffer): Record<string, string> {
  const out = new Map<string, string>();
  // Upstream asks `includes('\r')` before replacing: a fast path, with the same answer.
  const str = src.toString().replace(/\r\n?/g, '\n');
  const len = str.length;
  let i = 0;

  while (i < len) {
    while (isWhitespace(str.charCodeAt(i))) i++;

    // A comment line — and the end of the source, where no key starts either — is read past
    // by the "no key here" step below.

    const { exportEnd, next } = exportPrefix(str, i);
    i = next;

    // The key, through the lookup table.
    const keyStart = i;
    while (KEY_CHAR[str.charCodeAt(i)] === 1) i++;
    let stop = str.charCodeAt(i);
    if (i === keyStart) {
      i = lineEnd(str, i);
      continue;
    }
    const key = str.slice(keyStart, i);
    const keyEnd = i;

    // Whitespace before the separator.
    if (isWhitespace(stop)) {
      do {
        i++;
        stop = str.charCodeAt(i);
      } while (isWhitespace(stop));
    }

    if (stop === EQUALS) {
      i++;
    } else if (stop === COLON && i === keyEnd && isWhitespace(str.charCodeAt(i + 1))) {
      // Unlike `=`, `:` needs one whitespace character after it, and that character belongs
      // to the separator even when it is a newline.
      i += 2;
    } else {
      // Not an assignment. The whitespace lookahead may have crossed a newline, so resume
      // from this key's own line — or from `export`'s, when that lookahead crossed one.
      i = lineEnd(str, exportEnd === -1 ? keyEnd : exportEnd);
      continue;
    }

    // A quoted value may cross whitespace and blank lines; an unquoted one keeps its start.
    const rawStart = i;
    let quoteStart = i;
    while (isWhitespace(str.charCodeAt(quoteStart))) quoteStart++;
    const quote = str.charCodeAt(quoteStart);
    const quoted = isQuote(quote) ? quotedValue(str, quoteStart, len) : undefined;
    const found = quoted ?? unquotedValue(str, rawStart, len);
    i = found.end;
    let value = found.value;

    // Expansion follows the opening quote, even one that never closes. Upstream also asks that an
    // unclosed one be on the key's own line, and that the value hold a backslash: when the quote
    // is on a later line the fallback read the key's own line, which is blank, so neither test
    // changes what is expanded.
    if (quote === QUOTE_DOUBLE) {
      value = value.replaceAll('\\n', '\n').replaceAll('\\r', '\r');
    }

    out.set(key, value);
  }

  return Object.fromEntries(out);
}
