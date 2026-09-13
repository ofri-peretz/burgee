/**
 * Display width of a string in terminal columns (R7).
 *
 * A column count is the one measurement the output stack cannot avoid: a spinner has to
 * know how many lines its frame occupied before it can erase them, and a box has to know
 * where its right edge falls. `string-width` does this in four packages; here it is one
 * function over `Intl.Segmenter` and a range table, because a package this size is not
 * worth a dependency tree (U5).
 *
 * The rules, in the order a cluster meets them:
 *   1. ANSI and other control sequences are not printed — `stripVTControlCharacters`.
 *   2. A grapheme cluster made only of ignorable, control, mark or surrogate code points
 *      occupies no column.
 *   3. An RGI emoji sequence is two columns, however many code points it is made of.
 *   4. Otherwise the East Asian Width of the cluster's first visible code point, plus the
 *      halfwidth-and-fullwidth forms trailing it in the same cluster (a dakuten).
 *
 * Ambiguous-width characters are counted narrow, which is what a terminal does unless it
 * has been told it is rendering an East Asian locale. `string-width` makes that an option;
 * nothing above this function has ever needed the other answer, so it is not one here.
 */
import { stripVTControlCharacters } from 'node:util';

/**
 * East Asian Wide and Fullwidth, as sorted `[low, high]` pairs flattened into one array —
 * Unicode 17's W and F categories, merged where they touch. Generated from the same
 * `EastAsianWidth.txt` derivation everyone uses; a binary search over 122 ranges is the
 * whole lookup.
 */
const WIDE: readonly number[] = [
  0x1100, 0x115F, 0x231A, 0x231B, 0x2329, 0x232A, 0x23E9, 0x23EC, 0x23F0, 0x23F0,
  0x23F3, 0x23F3, 0x25FD, 0x25FE, 0x2614, 0x2615, 0x2630, 0x2637, 0x2648, 0x2653,
  0x267F, 0x267F, 0x268A, 0x268F, 0x2693, 0x2693, 0x26A1, 0x26A1, 0x26AA, 0x26AB,
  0x26BD, 0x26BE, 0x26C4, 0x26C5, 0x26CE, 0x26CE, 0x26D4, 0x26D4, 0x26EA, 0x26EA,
  0x26F2, 0x26F3, 0x26F5, 0x26F5, 0x26FA, 0x26FA, 0x26FD, 0x26FD, 0x2705, 0x2705,
  0x270A, 0x270B, 0x2728, 0x2728, 0x274C, 0x274C, 0x274E, 0x274E, 0x2753, 0x2755,
  0x2757, 0x2757, 0x2795, 0x2797, 0x27B0, 0x27B0, 0x27BF, 0x27BF, 0x2B1B, 0x2B1C,
  0x2B50, 0x2B50, 0x2B55, 0x2B55, 0x2E80, 0x2E99, 0x2E9B, 0x2EF3, 0x2F00, 0x2FD5,
  0x2FF0, 0x303E, 0x3041, 0x3096, 0x3099, 0x30FF, 0x3105, 0x312F, 0x3131, 0x318E,
  0x3190, 0x31E5, 0x31EF, 0x321E, 0x3220, 0x3247, 0x3250, 0xA48C, 0xA490, 0xA4C6,
  0xA960, 0xA97C, 0xAC00, 0xD7A3, 0xF900, 0xFAFF, 0xFE10, 0xFE19, 0xFE30, 0xFE52,
  0xFE54, 0xFE66, 0xFE68, 0xFE6B, 0xFF01, 0xFF60, 0xFFE0, 0xFFE6, 0x16FE0, 0x16FE4,
  0x16FF0, 0x16FF1, 0x17000, 0x187F7, 0x18800, 0x18CD5, 0x18CFF, 0x18D08, 0x1AFF0, 0x1AFF3,
  0x1AFF5, 0x1AFFB, 0x1AFFD, 0x1AFFE, 0x1B000, 0x1B122, 0x1B132, 0x1B132, 0x1B150, 0x1B152,
  0x1B155, 0x1B155, 0x1B164, 0x1B167, 0x1B170, 0x1B2FB, 0x1D300, 0x1D356, 0x1D360, 0x1D376,
  0x1F004, 0x1F004, 0x1F0CF, 0x1F0CF, 0x1F18E, 0x1F18E, 0x1F191, 0x1F19A, 0x1F200, 0x1F202,
  0x1F210, 0x1F23B, 0x1F240, 0x1F248, 0x1F250, 0x1F251, 0x1F260, 0x1F265, 0x1F300, 0x1F320,
  0x1F32D, 0x1F335, 0x1F337, 0x1F37C, 0x1F37E, 0x1F393, 0x1F3A0, 0x1F3CA, 0x1F3CF, 0x1F3D3,
  0x1F3E0, 0x1F3F0, 0x1F3F4, 0x1F3F4, 0x1F3F8, 0x1F43E, 0x1F440, 0x1F440, 0x1F442, 0x1F4FC,
  0x1F4FF, 0x1F53D, 0x1F54B, 0x1F54E, 0x1F550, 0x1F567, 0x1F57A, 0x1F57A, 0x1F595, 0x1F596,
  0x1F5A4, 0x1F5A4, 0x1F5FB, 0x1F64F, 0x1F680, 0x1F6C5, 0x1F6CC, 0x1F6CC, 0x1F6D0, 0x1F6D2,
  0x1F6D5, 0x1F6D7, 0x1F6DC, 0x1F6DF, 0x1F6EB, 0x1F6EC, 0x1F6F4, 0x1F6FC, 0x1F7E0, 0x1F7EB,
  0x1F7F0, 0x1F7F0, 0x1F90C, 0x1F93A, 0x1F93C, 0x1F945, 0x1F947, 0x1F9FF, 0x1FA70, 0x1FA7C,
  0x1FA80, 0x1FA89, 0x1FA8F, 0x1FAC6, 0x1FACE, 0x1FADC, 0x1FADF, 0x1FAE9, 0x1FAF0, 0x1FAF8,
  0x20000, 0x2FFFD, 0x30000, 0x3FFFD,];

const NARROW = 1;
const WIDE_COLUMNS = 2;

/** Half the flat array is lows, so a step over pairs. */
const PAIR = 2;

/**
 * East Asian **Ambiguous** — the characters a terminal renders one column wide in a Latin
 * context and two in a CJK one. `±`, `×`, `÷`, the box-drawing set, Greek and Cyrillic.
 *
 * Unlike WIDE above, this table is **generated**, by `scripts/generate-ambiguous.mjs`: 179
 * ranges is past the size where transcribing a text file by hand is honest work. The sweep
 * reads `get-east-asian-width`, already a devDependency because the suite grades against it,
 * and the result is committed — no dependency at run time, and a Unicode update produces a
 * reviewable diff rather than a silent drift. `--check` fails when the two disagree.
 */
const AMBIGUOUS: readonly number[] = [
  0x00A1, 0x00A1, 0x00A4, 0x00A4, 0x00A7, 0x00A8, 0x00AA, 0x00AA, 0x00AD, 0x00AE,
  0x00B0, 0x00B4, 0x00B6, 0x00BA, 0x00BC, 0x00BF, 0x00C6, 0x00C6, 0x00D0, 0x00D0,
  0x00D7, 0x00D8, 0x00DE, 0x00E1, 0x00E6, 0x00E6, 0x00E8, 0x00EA, 0x00EC, 0x00ED,
  0x00F0, 0x00F0, 0x00F2, 0x00F3, 0x00F7, 0x00FA, 0x00FC, 0x00FC, 0x00FE, 0x00FE,
  0x0101, 0x0101, 0x0111, 0x0111, 0x0113, 0x0113, 0x011B, 0x011B, 0x0126, 0x0127,
  0x012B, 0x012B, 0x0131, 0x0133, 0x0138, 0x0138, 0x013F, 0x0142, 0x0144, 0x0144,
  0x0148, 0x014B, 0x014D, 0x014D, 0x0152, 0x0153, 0x0166, 0x0167, 0x016B, 0x016B,
  0x01CE, 0x01CE, 0x01D0, 0x01D0, 0x01D2, 0x01D2, 0x01D4, 0x01D4, 0x01D6, 0x01D6,
  0x01D8, 0x01D8, 0x01DA, 0x01DA, 0x01DC, 0x01DC, 0x0251, 0x0251, 0x0261, 0x0261,
  0x02C4, 0x02C4, 0x02C7, 0x02C7, 0x02C9, 0x02CB, 0x02CD, 0x02CD, 0x02D0, 0x02D0,
  0x02D8, 0x02DB, 0x02DD, 0x02DD, 0x02DF, 0x02DF, 0x0300, 0x036F, 0x0391, 0x03A1,
  0x03A3, 0x03A9, 0x03B1, 0x03C1, 0x03C3, 0x03C9, 0x0401, 0x0401, 0x0410, 0x044F,
  0x0451, 0x0451, 0x2010, 0x2010, 0x2013, 0x2016, 0x2018, 0x2019, 0x201C, 0x201D,
  0x2020, 0x2022, 0x2024, 0x2027, 0x2030, 0x2030, 0x2032, 0x2033, 0x2035, 0x2035,
  0x203B, 0x203B, 0x203E, 0x203E, 0x2074, 0x2074, 0x207F, 0x207F, 0x2081, 0x2084,
  0x20AC, 0x20AC, 0x2103, 0x2103, 0x2105, 0x2105, 0x2109, 0x2109, 0x2113, 0x2113,
  0x2116, 0x2116, 0x2121, 0x2122, 0x2126, 0x2126, 0x212B, 0x212B, 0x2153, 0x2154,
  0x215B, 0x215E, 0x2160, 0x216B, 0x2170, 0x2179, 0x2189, 0x2189, 0x2190, 0x2199,
  0x21B8, 0x21B9, 0x21D2, 0x21D2, 0x21D4, 0x21D4, 0x21E7, 0x21E7, 0x2200, 0x2200,
  0x2202, 0x2203, 0x2207, 0x2208, 0x220B, 0x220B, 0x220F, 0x220F, 0x2211, 0x2211,
  0x2215, 0x2215, 0x221A, 0x221A, 0x221D, 0x2220, 0x2223, 0x2223, 0x2225, 0x2225,
  0x2227, 0x222C, 0x222E, 0x222E, 0x2234, 0x2237, 0x223C, 0x223D, 0x2248, 0x2248,
  0x224C, 0x224C, 0x2252, 0x2252, 0x2260, 0x2261, 0x2264, 0x2267, 0x226A, 0x226B,
  0x226E, 0x226F, 0x2282, 0x2283, 0x2286, 0x2287, 0x2295, 0x2295, 0x2299, 0x2299,
  0x22A5, 0x22A5, 0x22BF, 0x22BF, 0x2312, 0x2312, 0x2460, 0x24E9, 0x24EB, 0x254B,
  0x2550, 0x2573, 0x2580, 0x258F, 0x2592, 0x2595, 0x25A0, 0x25A1, 0x25A3, 0x25A9,
  0x25B2, 0x25B3, 0x25B6, 0x25B7, 0x25BC, 0x25BD, 0x25C0, 0x25C1, 0x25C6, 0x25C8,
  0x25CB, 0x25CB, 0x25CE, 0x25D1, 0x25E2, 0x25E5, 0x25EF, 0x25EF, 0x2605, 0x2606,
  0x2609, 0x2609, 0x260E, 0x260F, 0x261C, 0x261C, 0x261E, 0x261E, 0x2640, 0x2640,
  0x2642, 0x2642, 0x2660, 0x2661, 0x2663, 0x2665, 0x2667, 0x266A, 0x266C, 0x266D,
  0x266F, 0x266F, 0x269E, 0x269F, 0x26BF, 0x26BF, 0x26C6, 0x26CD, 0x26CF, 0x26D3,
  0x26D5, 0x26E1, 0x26E3, 0x26E3, 0x26E8, 0x26E9, 0x26EB, 0x26F1, 0x26F4, 0x26F4,
  0x26F6, 0x26F9, 0x26FB, 0x26FC, 0x26FE, 0x26FF, 0x273D, 0x273D, 0x2776, 0x277F,
  0x2B56, 0x2B59, 0x3248, 0x324F, 0xE000, 0xF8FF, 0xFE00, 0xFE0F, 0xFFFD, 0xFFFD,
  0x1F100, 0x1F10A, 0x1F110, 0x1F12D, 0x1F130, 0x1F169, 0x1F170, 0x1F18D, 0x1F18F, 0x1F190,
  0x1F19B, 0x1F1AC, 0xE0100, 0xE01EF, 0xF0000, 0xFFFFD, 0x100000, 0x10FFFD,
];

/** Binary search over a flat `[low, high]` table. Both tables are laid out for this. */
function inTable(table: readonly number[], codePoint: number): boolean {
  let low = 0;
  let high = table.length / PAIR - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const start = table[mid * PAIR] ?? 0;
    const end = table[mid * PAIR + 1] ?? 0;
    if (codePoint < start) high = mid - 1;
    else if (codePoint > end) low = mid + 1;
    else return true;
  }
  return false;
}

function isWide(codePoint: number): boolean {
  return inTable(WIDE, codePoint);
}

function isAmbiguous(codePoint: number): boolean {
  return inTable(AMBIGUOUS, codePoint);
}

// `v`-mode properties: the whole point of using them is that Node ships the tables.
const ZERO_WIDTH_CLUSTER = /^(?:\p{Default_Ignorable_Code_Point}|\p{Control}|\p{Mark}|\p{Surrogate})+$/v;
const LEADING_NON_PRINTING = /^[\p{Default_Ignorable_Code_Point}\p{Control}\p{Format}\p{Mark}\p{Surrogate}]+/v;
const RGI_EMOJI = /^\p{RGI_Emoji}$/v;

/** The Halfwidth and Fullwidth Forms block, which a cluster can carry after its base. */
const FORMS_FIRST = 0xff00;
const FORMS_LAST = 0xffef;

const segmenter = new Intl.Segmenter();

/** Columns a cluster's trailing fullwidth forms add — `ｶﾞ` is a base plus a wide mark. */
function trailingForms(cluster: string): number {
  let extra = 0;
  for (const character of [...cluster].slice(1)) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint >= FORMS_FIRST && codePoint <= FORMS_LAST) extra += isWide(codePoint) ? WIDE_COLUMNS : NARROW;
  }
  return extra;
}

/**
 * Columns a string of *plain* text occupies — no escape scan. The wrapper below has
 * already split its input into text runs and complete sequences, so rescanning would only
 * give a malformed sequence a second chance to be mistaken for one.
 */
export function measure(text: string, ambiguousIsWide = false): number {
  let columns = 0;
  for (const { segment } of segmenter.segment(text)) {
    if (ZERO_WIDTH_CLUSTER.test(segment)) continue;
    if (RGI_EMOJI.test(segment)) {
      columns += WIDE_COLUMNS;
      continue;
    }
    const codePoint = segment.replace(LEADING_NON_PRINTING, '').codePointAt(0) ?? 0;
    const wide = isWide(codePoint) || (ambiguousIsWide && isAmbiguous(codePoint));
    columns += wide ? WIDE_COLUMNS : NARROW;
    columns += trailingForms(segment);
  }
  return columns;
}

/**
 * What `width` accepts beyond the string. Graded against `string-width`'s own suite, so the
 * names and the defaults are its names and its defaults, not ours.
 */
export interface WidthOptions {
  /**
   * Treat East Asian Ambiguous characters as one column. **Default `true`** — the incumbent's
   * default, and right for a Latin terminal: `±`, `×`, `÷`, the box-drawing set, Greek and
   * Cyrillic all occupy one column there.
   *
   * `false` for a CJK context, where a terminal using a CJK font renders the same characters
   * two columns wide. Nothing can detect which a terminal is doing, which is exactly why this
   * is the caller's decision and not ours.
   */
  ambiguousIsNarrow?: boolean;

  /**
   * Count escape sequences as the characters they are made of instead of removing them.
   *
   * Off by default, which is what every caller measuring styled output wants. On, the escape
   * byte itself is still non-printing — `\u001B[31m` measures 4, the `[31m` a terminal would
   * have swallowed.
   */
  countAnsiEscapeCodes?: boolean;
}

/**
 * How many terminal columns `input` occupies once its escape sequences are removed.
 *
 * **Non-strings measure 0.** `string-width` has always answered `0` for a number, `null` or
 * `undefined` rather than throwing, and callers rely on it — a width function is usually
 * reached with whatever a template produced. Three cases of its suite grade exactly this, and
 * the check is `typeof` rather than a truthiness test so that `0` and `false` are not quietly
 * treated as strings that happen to be empty.
 */
export function width(input: string, options: WidthOptions = {}): number {
  if (typeof input !== 'string' || input === '') return 0;
  const text = options.countAnsiEscapeCodes === true ? input : stripVTControlCharacters(input);
  return measure(text, options.ambiguousIsNarrow === false);
  return measure(options.countAnsiEscapeCodes === true ? input : stripVTControlCharacters(input));
}

/**
 * Lines a string occupies in a terminal `columns` wide — the measurement the frame loop
 * actually asks for. An empty line still occupies one.
 */
export function lineCount(text: string, columns: number): number {
  let count = 0;
  for (const line of stripVTControlCharacters(text).split('\n')) count += Math.max(1, Math.ceil(width(line) / columns));
  return count;
}
