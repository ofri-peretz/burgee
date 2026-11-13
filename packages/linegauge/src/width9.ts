/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Display width of a string in terminal columns, by **string-width 9.0.0's** rules — the
 * root's `width`, and so the default export `string-width`'s own suite grades (466 / 466).
 *
 * string-width 9 rewrote the per-cluster rules (2026-11-11), and the rest of the ecosystem has
 * not followed yet: slice-ansi 10.0.1, wrap-ansi 10.0.2, cli-truncate 6.2.0, widest-line, boxen
 * and ink all depend on `string-width@^8`, and slice-ansi's suite asserts 8's answers (a lone
 * regional indicator is one column, a leading jamo before a syllable four). So `slice`, `wrap`,
 * `truncate`, `widest` and every drop-in built on them measure with `width.ts`, string-width
 * 8.3.0's rules, which `linegauge/v8` publishes for a project pinned to 8
 * (D-20261113-string-width-9). This file shares that one's tables, ASCII shortcut and plugin
 * seam, and nothing else.
 *
 * What 9 changed, cluster by cluster, each ported red first in `width9.test.ts`:
 *   - a lone surrogate is `U+FFFD`, which a terminal draws, not nothing;
 *   - a prepended concatenation mark (`U+0600` ARABIC NUMBER SIGN) is a visible column, unless
 *     the glyph after it is wide and draws it inside its own cell;
 *   - a cluster opening with Hangul is one syllable block, the width of its first code point;
 *   - a cluster opening with an emoji is two columns whatever trails it, a lone or unpaired
 *     regional indicator and a digit with `U+FE0F` included, and a wide BMP emoji with `U+FE0E`
 *     is one; a stray skin-tone modifier is a two-column swatch of its own;
 *   - anything else is the sum of its visible code points up to a joiner — an Indic conjunct,
 *     Thai and Lao AM — where 8 counted the base and its spacing marks.
 */
import { strip } from './strip.js';
import { claimOf, isAmbiguous, isWide, plainAscii, type WidthOptions } from './width.js';

const NARROW = 1;
const WIDE_COLUMNS = 2;

/** The last printable ASCII code point: nothing at or below it is in either width table. */
const TILDE = 0x7e;
const SPACE = 0x20;

/**
 * The property classes, built from source strings on first use rather than as literals: V8
 * builds a `\p{…}` set when it compiles the literal, so a module carrying them pays at import
 * whether or not anything is measured (`width.ts` has the measurement). One binding per class,
 * because a minifier renames a `let` and cannot rename a property.
 */
let visibleClass: RegExp | undefined;
let emojiClass: RegExp | undefined;
let textStyleClass: RegExp | undefined;
let joinedClass: RegExp | undefined;
let modifierClass: RegExp | undefined;
let marksClass: RegExp | undefined;

/**
 * The spacing **prepended concatenation marks** — `U+0600` ARABIC NUMBER SIGN and its kin.
 * They are `Format` and visible: a sign drawn across the digits after it. `U+070F` SYRIAC
 * ABBREVIATION MARK is the one Prepended_Concatenation_Mark that draws nothing, and is left out.
 */
const PREPENDED = '\\u{600}-\\u{605}\\u{6DD}\\u{890}\\u{891}\\u{8E2}\\u{110BD}\\u{110CD}';

/**
 * One visible code point: outside Default_Ignorable, Control, the nonspacing and enclosing
 * marks, and Format other than the prepended marks. No quantifier, so a `search` walks forward
 * once and cannot backtrack — the shape `width.ts` records the hang for. The property names are
 * their short aliases (`DI` is Default_Ignorable_Code_Point, `Cf` Format, `EMod` Emoji_Modifier):
 * the same sets in fewer bundled bytes.
 */
const VISIBLE = (): RegExp => (visibleClass ??= new RegExp(`[^\\p{DI}\\p{Cc}\\p{Me}\\p{Mn}[\\p{Cf}--[${PREPENDED}]]]`, 'v'));
/**
 * A cluster that **opens** with an emoji: an RGI sequence, one or two regional indicators (a
 * lone one, or a pair naming no flag, is still drawn as one wide symbol), or a digit, `#` or `*`
 * with `U+FE0F`. Not anchored at the end, so a dangling joiner or an extra selector after it
 * does not hide it.
 */
const EMOJI = (): RegExp => (emojiClass ??= new RegExp('^(?:\\p{RGI_Emoji}|\\p{RI}{1,2}|[\\d#*]\\u{FE0F})', 'v'));
/** A wide BMP emoji asking for its text style with `U+FE0E`: one column. */
const TEXT_STYLE = (): RegExp => (textStyleClass ??= new RegExp('^[\\p{EPres}--[\\u{10000}-\\u{10FFFF}]]\\u{FE0E}', 'v'));
/** A joiner binding a pictograph, which GB11 allows only after another: a ZWJ sequence. */
const JOINED = (): RegExp => (joinedClass ??= new RegExp('\\u{200D}\\p{ExtPict}', 'v'));
/** An emoji modifier with no modifier base (or joiner) before it: drawn as a swatch. */
const STRAY_MODIFIER = (): RegExp => (modifierClass ??= new RegExp('(?<![\\p{EBase}\\u{200D}])\\p{EMod}', 'gv'));
const LEADING_MARKS = (): RegExp => (marksClass ??= new RegExp(`^[${PREPENDED}]+`, 'v'));

/** A cluster opening with a Hangul jamo, a filler or a precomposed syllable. */
const HANGUL = /^[\u1100-\u11FF\uA960-\uA97C\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB]/u;

/** Kirat Rai's vowel signs: a run of them is one glyph, however it is spelled. */
const KIRAT_RAI_RUN = /(?<=[\u{16D63}-\u{16D6A}])[\u{16D63}-\u{16D6A}]+/gu;

/**
 * Whether a cluster could be an emoji at all — the gate `width.ts` measured (B5), and still
 * sound under 9's rules: every shape they accept carries a code point at U+2000..U+24FF,
 * U+25FD..U+2FFF or U+D800 and above (an Emoji_Presentation code point, a regional indicator,
 * `U+FE0E`, `U+FE0F` or the joiner). Kirat Rai is astral, so its run is behind the gate too.
 */
const MAY_BE_EMOJI = /[\u2000-\u24FF\u25FD-\u2FFF\uD800-\u{10FFFF}]/u;

/**
 * One UTF-16 code unit that is **a cluster of its own whatever stands before it**, and visible:
 * printable ASCII; Latin-1's letters and signs, less the soft hyphen and `©` and `®` (pictographs
 * a joiner can bind); CJK punctuation less the tone marks and the two pictographs; kana less the
 * combining sound marks; common Han; precomposed Hangul; the halfwidth and fullwidth forms less
 * the halfwidth sound marks. None extends, joins, prepends or pairs, so no grapheme rule binds
 * one to the code unit before it — except a syllable after a jamo, which `HOLDS` covers.
 */
const ALONE = /[ -~\xA0-\xA8\xAA-\xAC\xAF-\xFF\u3000-\u3029\u3031-\u303C\u303E-\u3098\u309B-\u30FF\u4E00-\u9FFF\uAC00-\uD7A3\uFF01-\uFF9D]/u;
/**
 * A code unit an `ALONE` one may still join after: a prepended mark's block, Malayalam's
 * prepended mark, a jamo, or a surrogate (an astral prepended mark is two). Too wide only
 * lengthens the stretch that is segmented.
 */
const HOLDS = /[\u0600-\u08FF\u0D4E\u1100-\u11FF\uA960-\uA97F\uD7B0-\uDFFF]/u;

/** Whether the code unit at `at` stands alone, printable ASCII answered without the regex. */
function alone(text: string, at: number): boolean {
  const code = text.codePointAt(at) as number;
  return code <= TILDE ? code >= SPACE : ALONE.test(text.charAt(at));
}

/** Built on first use: ICU's break data cost 7.0 ms of import when it was built at load. */
let cached: Intl.Segmenter | undefined;
const segmenter = (): Intl.Segmenter => (cached ??= new Intl.Segmenter());

/** East Asian Width of one code point, in columns, under the caller's ambiguous policy. */
function columnsOf(codePoint: number, ambiguousIsWide: boolean): number {
  // Stryker disable next-line ConditionalExpression,EqualityOperator: ASCII is in neither table, so the lookup below answers narrow too
  if (codePoint <= TILDE) return NARROW;
  return isWide(codePoint) || (ambiguousIsWide && isAmbiguous(codePoint)) ? WIDE_COLUMNS : NARROW;
}

/** Columns the stray emoji modifiers from `from` on add: a two-column swatch each. */
function strays(cluster: string, from: number): number {
  const modifier = STRAY_MODIFIER();
  modifier.lastIndex = from;
  let columns = 0;
  while (modifier.test(cluster)) columns += WIDE_COLUMNS;
  return columns;
}

/**
 * The East Asian Width of every visible code point up to a joiner: the base, its spacing marks
 * (Thai and Lao AM among them), a stray modifier, the consonants of a conjunct joined by a
 * virama, a halfwidth dakuten. After a joiner comes a half-form drawn inside the glyph before it.
 */
function visibleColumns(visible: string, ambiguousIsWide: boolean): number {
  let columns = 0;
  for (const character of visible) {
    if (character === '\u200D') break;
    if (VISIBLE().test(character)) columns += columnsOf(character.codePointAt(0) as number, ambiguousIsWide);
  }
  return columns;
}

/**
 * Columns one grapheme cluster occupies. A plugin's claim comes first, as in `width.ts`: a
 * user describing the terminal in front of them outranks a table describing terminals in
 * general.
 */
/**
 * A cluster opening with prepended marks: a column each, unless the glyph after them is wide —
 * East Asian Wide, or an emoji not asked for in text style — and draws them inside its own cell.
 */
function markedColumns(segment: string, marks: string, ambiguousIsWide: boolean): number {
  const rest = segment.slice(marks.length);
  const restColumns = clusterColumns(rest, ambiguousIsWide);
  const glyph = rest.slice(rest.search(VISIBLE()));
  const wide = restColumns >= WIDE_COLUMNS && (columnsOf(glyph.codePointAt(0) as number, ambiguousIsWide) === WIDE_COLUMNS || EMOJI().test(glyph) || JOINED().test(glyph));
  return wide ? restColumns : [...marks].length + restColumns;
}

/** A visible cluster that may be an emoji: its columns, or `undefined` when it is not one. */
function emojiColumns(cluster: string): number | undefined {
  if (TEXT_STYLE().test(cluster)) return NARROW;
  const [emoji = ''] = EMOJI().exec(cluster) ?? [];
  if (emoji !== '') return WIDE_COLUMNS + strays(cluster, emoji.length);
  // From the joiner on: the pictograph it binds is no modifier, so starting there counts what
  // starting after it would.
  const joined = cluster.search(JOINED());
  return joined === -1 ? undefined : WIDE_COLUMNS + strays(cluster, joined);
}

/**
 * Columns one grapheme cluster occupies. A plugin's claim comes first, as in `width.ts`: a
 * user describing the terminal in front of them outranks a table describing terminals in
 * general.
 */
export function clusterColumns(segment: string, ambiguousIsWide = false): number {
  const first = segment.codePointAt(0) as number;
  const claimed = claimOf(first);
  if (claimed !== undefined) return claimed;
  // One code unit: every rule below gives it its own East Asian Width or nothing, since a
  // one-unit emoji is East Asian Wide and a one-unit Hangul cluster is its first code point.
  // A lone surrogate is always a cluster of its own, and is written out as U+FFFD REPLACEMENT
  // CHARACTER, which a terminal draws.
  if (segment.length === 1) {
    const unit = segment.toWellFormed();
    return ALONE.test(unit) || VISIBLE().test(unit) ? columnsOf(unit.codePointAt(0) as number, ambiguousIsWide) : 0;
  }
  const [marks = ''] = LEADING_MARKS().exec(segment) ?? [];
  if (marks !== '') return markedColumns(segment, marks, ambiguousIsWide);
  const skipped = segment.search(VISIBLE());
  if (skipped === -1) return 0;
  // Asked of the whole cluster, which may open with a Default_Ignorable Hangul filler.
  if (HANGUL.test(segment)) return columnsOf(first, ambiguousIsWide) + strays(segment, 1);
  const cluster = segment.slice(skipped);
  if (!MAY_BE_EMOJI.test(cluster)) return visibleColumns(cluster, ambiguousIsWide);
  // A run of Kirat Rai vowel signs is astral, so it is behind the gate with the emoji.
  return emojiColumns(cluster) ?? visibleColumns(cluster.replace(KIRAT_RAI_RUN, ''), ambiguousIsWide);
}

/** Every cluster of `text`, measured one by one. */
function segmented(text: string, ambiguousIsWide: boolean): number {
  let columns = 0;
  for (const { segment } of segmenter().segment(text)) columns += clusterColumns(segment, ambiguousIsWide);
  return columns;
}

/**
 * Columns a string of plain text occupies — no escape scan.
 *
 * The code units at either end that stand alone (`ALONE`) are counted at their East Asian Width
 * directly, and only the stretch between them is handed to `Intl.Segmenter`, once. string-width
 * 9 does this for printable ASCII; this does it for Latin-1, kana, Han, Hangul syllables and the
 * fullwidth forms too, so a line of Japanese is never segmented at all (B5). The last code unit
 * of a prefix goes to the stretch when the one after it does not stand alone, since a mark or a
 * joiner may extend it. A plugin may claim any code point, so with one installed every cluster
 * is asked.
 */
export function measure(text: string, ambiguousIsWide = false): number {
  // Stryker disable next-line ConditionalExpression: without the shortcut the clusters below are one column each, the same length
  if (plainAscii(text)) return text.length;
  // `plainAscii('')` is true exactly when no plugin is installed.
  if (!plainAscii('')) return segmented(text, ambiguousIsWide);
  let columns = 0;
  let start = 0;
  let end = text.length;
  // Each code unit is asked once going forward: whether it stands alone is the next step's
  // question about the one before it.
  let here = alone(text, start);
  while (here && start < end) {
    here = start + 1 === end || alone(text, start + 1);
    if (!here) break;
    columns += columnsOf(text.codePointAt(start) as number, ambiguousIsWide);
    start += 1;
  }
  while (end > start && alone(text, end - 1) && !HOLDS.test(text.charAt(end - 2))) {
    columns += columnsOf(text.codePointAt(end - 1) as number, ambiguousIsWide);
    end -= 1;
  }
  return start === end ? columns : columns + segmented(text.slice(start, end), ambiguousIsWide);
}

/**
 * How many terminal columns `input` occupies once its escape sequences are removed — string-width
 * 9's answer, under its option names and defaults (`WidthOptions`). Non-strings measure 0.
 */
export function width(input: string, options: WidthOptions = {}): number {
  if (typeof input !== 'string') return 0;
  return measure(options.countAnsiEscapeCodes === true ? input : strip(input), options.ambiguousIsNarrow === false);
}

/**
 * Lines a string occupies in a terminal `columns` wide, each measured by `width`. An empty line
 * still occupies one.
 */
export function lineCount(text: string, columns: number): number {
  let count = 0;
  for (const line of strip(text).split('\n')) count += Math.max(1, Math.ceil(width(line) / columns));
  return count;
}
