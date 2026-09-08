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

function isWide(codePoint: number): boolean {
  let low = 0;
  let high = WIDE.length / PAIR - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const start = WIDE[mid * PAIR] ?? 0;
    const end = WIDE[mid * PAIR + 1] ?? 0;
    if (codePoint < start) high = mid - 1;
    else if (codePoint > end) low = mid + 1;
    else return true;
  }
  return false;
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

/** How many terminal columns `input` occupies once its escape sequences are removed. */
export function width(input: string): number {
  if (input === '') return 0;
  const text = stripVTControlCharacters(input);
  let columns = 0;
  for (const { segment } of segmenter.segment(text)) {
    if (ZERO_WIDTH_CLUSTER.test(segment)) continue;
    if (RGI_EMOJI.test(segment)) {
      columns += WIDE_COLUMNS;
      continue;
    }
    const codePoint = segment.replace(LEADING_NON_PRINTING, '').codePointAt(0) ?? 0;
    columns += isWide(codePoint) ? WIDE_COLUMNS : NARROW;
    columns += trailingForms(segment);
  }
  return columns;
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
