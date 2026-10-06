/**
 * dotenv 18's `{ fast: true }` parser — the hand-written character scanner from upstream
 * #1010 and the six releases of fixes after it — ported line for line from `lib/main.js`
 * (18.0.5, `parseFast`).
 *
 * It is a second grammar, not an optimisation of the first: dotenv's own suite grades it
 * separately (`test-parse-fast.js`) and pins exactly where it differs from the regex parser,
 * so "cleaner" here would mean "different". The structure — the index arithmetic, the order
 * of the checks — is upstream's; only the names of the character codes are ours.
 */

/* eslint-disable conventions/prefer-code-point -- the scanner indexes UTF-16 code units, as upstream's `charCodeAt` does: every index here is a code-unit index and the arithmetic is the port's. No character this grammar turns on is outside the BMP. */
const TAB = 9;
const LF = 10;
const CR_LAST = 13;
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
 * Below this a value's comment is found with `indexOf`, above it by a scan bounded to the
 * line — upstream's own threshold (18.0.5, "Bound fast parser comment scans to the current line").
 */
const SHORT_SOURCE = 4096;

/** `[A-Za-z0-9_.-]`, as a lookup table — upstream's `KEY_CHAR`. */
const KEY_CHAR = new Uint8Array(256);
for (let c = 48; c <= 57; c++) KEY_CHAR[c] = 1;
for (let c = 65; c <= 90; c++) KEY_CHAR[c] = 1;
for (let c = 97; c <= 122; c++) KEY_CHAR[c] = 1;
KEY_CHAR[45] = 1;
KEY_CHAR[46] = 1;
KEY_CHAR[95] = 1;

/** JavaScript whitespace, the common ASCII cases first. */
function isWhitespace(c: number): boolean {
  if (c <= SPACE) return c === SPACE || (c >= TAB && c <= CR_LAST);
  return c >= NBSP && (c === NBSP || c === 5760 || (c >= 8192 && c <= 8202) || c === LINE_SEPARATOR || c === PARAGRAPH_SEPARATOR || c === 8239 || c === 8287 || c === 12288 || c === 65279);
}

/** Line ends after CR is normalised: LF and the two Unicode separators. */
function isLineEnd(c: number): boolean {
  return c === LF || c === LINE_SEPARATOR || c === PARAGRAPH_SEPARATOR;
}

const isQuote = (c: number): boolean => c === QUOTE_SINGLE || c === QUOTE_DOUBLE || c === BACKTICK;

/** Where `export` ends if it is a prefix here, else -1; and where the key then starts. */
function exportPrefix(str: string, i: number, len: number): { exportEnd: number; next: number } {
  const none = { exportEnd: -1, next: i };
  if (str.charCodeAt(i) !== LOWER_E || i + EXPORT_LENGTH >= len) return none;
  if (!XPORT.every((code, k) => str.charCodeAt(i + 1 + k) === code)) return none;
  if (!isWhitespace(str.charCodeAt(i + EXPORT_LENGTH))) return none;
  let next = i + EXPORT_LENGTH + 1;
  while (next < len && isWhitespace(str.charCodeAt(next))) next++;
  // Without a following key, `export` is the key itself.
  return KEY_CHAR[str.charCodeAt(next)] === 1 ? { exportEnd: i + EXPORT_LENGTH, next } : none;
}

/** The end of the line `i` is on. */
function lineEnd(str: string, i: number, len: number): number {
  let at = i;
  while (at < len && !isLineEnd(str.charCodeAt(at))) at++;
  return at;
}

/** A quoted value starting at `quoteStart`, or undefined when no complete one closes there. */
function quotedValue(str: string, quoteStart: number, len: number): { value: string; end: number } | undefined {
  const quoteChar = str.charAt(quoteStart);
  let j = str.indexOf(quoteChar, quoteStart + 1);
  let closingQuote = -1;
  let closingEnd = -1;
  while (j !== -1) {
    // Jump between matching quotes. Backslashes are preserved, so only the character just
    // before decides whether a quote can be interior text.
    const escaped = str.charCodeAt(j - 1) === BACKSLASH;
    let end = j + 1;
    while (end < len && !isLineEnd(str.charCodeAt(end)) && isWhitespace(str.charCodeAt(end))) end++;
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
  const end = str.charCodeAt(closingEnd) === HASH ? lineEnd(str, closingEnd, len) : closingEnd;
  return { value: str.slice(quoteStart + 1, closingQuote), end };
}

/** An unquoted value from `rawStart`: up to a comment or the line end, trimmed, one pair of matching quotes unwrapped. */
function unquotedValue(str: string, rawStart: number, len: number): { value: string; end: number } {
  let nl = str.indexOf('\n', rawStart);
  if (nl === -1) nl = len;
  let hash: number;
  if (len < SHORT_SOURCE) {
    hash = str.indexOf('#', rawStart);
    if (hash === -1 || hash > nl) hash = nl;
  } else {
    hash = rawStart;
    while (hash < nl && str.charCodeAt(hash) !== HASH) hash++;
  }
  let start = rawStart;
  let end = hash;
  while (start < end && isWhitespace(str.charCodeAt(start))) start++;
  while (end > start && isWhitespace(str.charCodeAt(end - 1))) end--;
  const first = str.charCodeAt(start);
  const value = end - start >= 2 && isQuote(first) && str.charCodeAt(end - 1) === first ? str.slice(start + 1, end - 1) : str.slice(start, end);
  // Unquoted values include Unicode separators, but comments do not.
  return { value, end: hash < nl ? lineEnd(str, hash, len) : hash };
}

/** Every `KEY=value` in `src`, by the scanner. Keys land in a Map first, so `__proto__` is an entry. */
export function parseFast(src: string | Buffer): Record<string, string> {
  const out = new Map<string, string>();
  let str = typeof src === 'string' ? src : src.toString();
  if (str.includes('\r')) str = str.replace(/\r\n?/g, '\n');
  const len = str.length;
  let i = 0;

  while (i < len) {
    while (i < len && isWhitespace(str.charCodeAt(i))) i++;
    if (i >= len) break;

    // A comment line.
    if (str.charCodeAt(i) === HASH) {
      i = lineEnd(str, i, len);
      continue;
    }

    const { exportEnd, next } = exportPrefix(str, i, len);
    i = next;

    // The key, through the lookup table.
    const keyStart = i;
    let stop = 0;
    while (i < len) {
      stop = str.charCodeAt(i);
      if (KEY_CHAR[stop] === 1) i++;
      else break;
    }
    if (i === keyStart) {
      i = lineEnd(str, i, len);
      continue;
    }
    const key = str.slice(keyStart, i);
    const keyEnd = i;
    if (i >= len) stop = 0;

    // Whitespace before the separator.
    if (isWhitespace(stop)) {
      do {
        i++;
        stop = i < len ? str.charCodeAt(i) : 0;
      } while (isWhitespace(stop));
    }

    if (stop === EQUALS) {
      i++;
    } else if (stop === COLON && i === keyEnd && i + 1 < len && isWhitespace(str.charCodeAt(i + 1))) {
      // Unlike `=`, `:` needs one whitespace character after it, and that character belongs
      // to the separator even when it is a newline.
      i += 2;
    } else {
      // Not an assignment. The whitespace lookahead may have crossed a newline, so resume
      // from this key's own line — or from `export`'s, when that lookahead crossed one.
      i = lineEnd(str, exportEnd === -1 ? keyEnd : exportEnd, len);
      continue;
    }

    // A quoted value may cross whitespace and blank lines; an unquoted one keeps its start.
    const rawStart = i;
    let quoteStart = i;
    while (quoteStart < len && isWhitespace(str.charCodeAt(quoteStart))) quoteStart++;
    const quote = str.charCodeAt(quoteStart);
    const quoted = isQuote(quote) ? quotedValue(str, quoteStart, len) : undefined;
    const found = quoted ?? unquotedValue(str, rawStart, len);
    i = found.end;
    let value = found.value;

    // Expansion follows the opening quote, even one that never closes — but for the unquoted
    // fallback, only a quote on the original line counts.
    if (quote === QUOTE_DOUBLE && (quoted !== undefined || quoteStart < i) && value.includes('\\')) {
      value = value.replaceAll('\\n', '\n').replaceAll('\\r', '\r');
    }

    out.set(key, value);
  }

  return Object.fromEntries(out);
}
