/**
 * R7 — the width function replaces `string-width`, so `string-width` grades it: every case
 * below is checked against the installed package as well as against a literal, and the
 * literal is there so a wrong answer names itself rather than agreeing with a moved
 * dependency. (`ambiguousIsNarrow` is supported under string-width's name and default;
 * every case here is unambiguous, so it does not change them.)
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import stringWidth from 'string-width';
import { describe, expect, it } from 'vitest';

import { INVISIBLE_CLASSES, leadingInvisible, lineCount, width } from './width.js';

const ESC = '\u001B';
const ZWSP = '\u200B';
const COMBINING_ACUTE = '\u0301';

describe('width()', () => {
  it.each([
    ['', 0],
    ['abc', 3],
    ['0'.repeat(50), 50],
    // East Asian Wide and Fullwidth.
    ['古池や', 6],
    ['ｶﾞ', 2],
    ['Ａ', 2],
    // Emoji, including a ZWJ sequence and a flag: one cluster, two columns each.
    ['🦄', 2],
    [`\u{1F469}\u200D\u{1F469}\u200D\u{1F466}`, 2],
    ['🇸🇪', 2],
    ['a🦄b', 4],
    // Combining marks and zero-width characters occupy nothing of their own.
    [`e${COMBINING_ACUTE}`, 1],
    [ZWSP, 0],
    // Escapes are not printed.
    [`${ESC}[31mred${ESC}[39m`, 3],
  ])('%j is %i columns, and string-width agrees', (input, columns) => {
    expect(width(input)).toBe(columns);
    expect(width(input)).toBe(stringWidth(input));
  });
});

describe('lineCount()', () => {
  it('an empty line still occupies one, and a wrapped line occupies its wraps', () => {
    expect(lineCount('', 80)).toBe(1);
    expect(lineCount('a\nb', 80)).toBe(2);
    expect(lineCount('0'.repeat(90), 80)).toBe(2);
    expect(lineCount('🦄'.repeat(50), 80)).toBe(2);
    expect(lineCount(`${ESC}[31m${'0'.repeat(90)}${ESC}[39m`, 80)).toBe(2);
  });
});

/**
 * The four cases that took the `string-width` row from 194 / 229 to 198. The vendored suite
 * is the gate; these are here so the loop is a second rather than a full grading run, and so
 * a reader sees the contract without going to `vendor/`.
 */
describe('the contract string-width has always kept', () => {
  it('measures a non-string as 0 rather than throwing', () => {
    // A width function is usually reached with whatever a template produced, so the
    // incumbent answers 0 instead of making every caller guard. `typeof`, not truthiness:
    // `0` and `false` are not empty strings.
    expect(width(123 as unknown as string)).toBe(0);
    expect(width(null as unknown as string)).toBe(0);
    expect(width(undefined as unknown as string)).toBe(0);
  });

  it('counts escape sequences as characters when asked, minus the escape byte itself', () => {
    // `[31m` is what a terminal would have swallowed; ESC stays non-printing either way.
    expect(width(`${ESC}[31m`, { countAnsiEscapeCodes: true })).toBe(4);
    expect(width(`${ESC}[31m`)).toBe(0);
  });
});

/**
 * The twenty-eight cases that took the `string-width` row from 201 / 229 to 229, in the four
 * categories `spec.md` § R10 names. They are reproduced here rather than left to the
 * vendored suite for the reason the block above gives — the loop is a second, not a full
 * grading run — and each is asserted against a literal *and* against the installed
 * incumbent, so a wrong answer cannot pass by agreeing with a moved dependency.
 *
 * Every one of the four was `linegauge` being wrong and `string-width` right. None of them
 * is a judgement call, which is why they are closed rather than argued with.
 */
describe('the twenty-eight string-width cases (spec.md R10, categories A–D)', () => {
  /**
   * A — `Intl.Segmenter` joins a run of conjoining jamo into one cluster (GB6/GB7/GB8), and
   * measuring the cluster by its first code point answered 2 where a terminal draws 12.
   * Modern Hangul composes L + V (+ T) into one two-column syllable; jamo that do not
   * compose stay additive at their own East Asian Width — L is Wide, V and T are not.
   */
  it.each([
    // The literals are spelled in escapes on purpose. Hand-writing `가` is the trap here:
    // the suite's `가` is the *decomposed* U+1100 U+1161, and a reduction written with the
    // precomposed U+AC00 measures a different string from the one being graded — which is
    // how a fix gets verified against a case the gate never runs.
    ['\u1100\u1100', 4],
    ['\u1100\u1100\u1100\u1100\u1100\u1100', 12],
    ['\u1100\u1100\u1161', 4],
    ['\u1100\u1161\u1161', 3],
    ['\u1100\u1161\u11A8\u11A8', 3],
    ['\u1100\u1100\uFE0F', 4],
    ['\u1100\u1100\u200D', 4],
    ['\u1161\u1161\u1161', 3],
    ['\u11A8\u11A8', 2],
    ['\u1100\uAC00', 4],
    // The shapes that must not move: a lone jamo, the compositions that do collapse, the
    // orders that do not, and the compatibility jamo that are plain wide characters.
    ['\u1100', 2],
    ['\u1161', 1],
    ['\u11A8', 1],
    ['\uAC00', 2],
    ['\u1100\u1161', 2],
    ['\u1100\u1161\u11A8', 2],
    ['\uA960\u1161', 2],
    ['\u1100\uD7B0', 2],
    ['\u1161\u1100', 3],
    ['\u1100\u11A8', 3],
    ['\u3131', 2],
    ['\u3131\u3131', 4],
  ])('A — Hangul jamo %j is %i columns', (input, columns) => {
    expect(width(input)).toBe(columns);
    expect(width(input)).toBe(stringWidth(input));
  });

  /**
   * B — the zero-width class matched `\p{Mark}`, which is `Mn` and `Mc` and `Me`. Only `Mn`
   * and `Me` are non-spacing; a spacing combining mark is drawn in its own column.
   */
  it.each([
    ['\u093E', 1],
    ['\u0915\u093E', 2],
    ['\u0915\u093F', 2],
    // The non-spacing neighbours, which must stay at zero.
    ['\u0301\u0302', 0],
    ['e\u0301\u0302', 1],
    ['a\u20DD', 1],
    ['\u0F5F\u0FB3', 1],
  ])('B — mark %j is %i columns', (input, columns) => {
    expect(width(input)).toBe(columns);
    expect(width(input)).toBe(stringWidth(input));
  });

  /**
   * C — prepended concatenation marks are `Format` but not `Default_Ignorable`, so the
   * zero-width class missed them; `measure` then stripped them as leading non-printing,
   * found an empty remainder, read code point 0 and charged a column for it. A character a
   * terminal does not advance the cursor for must not cost one.
   */
  it.each([
    ['\u0600', 0],
    ['\u06DD', 0],
    ['\u070F', 0],
  ])('C — format character %j is %i columns', (input, columns) => {
    expect(width(input)).toBe(columns);
    expect(width(input)).toBe(stringWidth(input));
  });

  /**
   * D — `\p{RGI_Emoji}` matches only the fully-qualified form, the one carrying `U+FE0F`.
   * Drop the variation selector and the same sequence is still a two-column emoji in every
   * terminal, but the regex stops matching. The rule that covers both shapes without
   * widening anything else: a cluster holding `U+200D` and two or more
   * `\p{Extended_Pictographic}` scalars, or a keycap over an ASCII digit, `#` or `*`.
   */
  it.each([
    ['\u2764\u200D\u{1F525}', 2],
    ['\u{1F3F3}\u200D\u{1F308}', 2],
    ['\u{1F3F3}\u200D\u26A7', 2],
    ['\u26D3\u200D\u{1F4A5}', 2],
    ['\u{1F441}\u200D\u{1F5E8}', 2],
    ['\u26F9\u200D\u2642', 2],
    ['\u26F9\u200D\u2640', 2],
    ['\u{1F575}\u200D\u2642', 2],
    ['\u{1F575}\u200D\u2640', 2],
    ['#\u20E3', 2],
    ['0\u20E3', 2],
    ['*\u20E3', 2],
    // The two the rule must not catch: an Indic conjunct joined by the same ZWJ, and a
    // keycap over a base that is not one. Both pass today and must keep passing.
    ['\u0915\u094D\u200D\u0937', 1],
    ['\u260E\uFE0F\u20E3', 1],
  ])('D — unqualified emoji %j is %i columns', (input, columns) => {
    expect(width(input)).toBe(columns);
    expect(width(input)).toBe(stringWidth(input));
  });
});

describe('ambiguousIsNarrow', () => {
  it('is narrow by default and wide when the caller says the terminal is CJK', () => {
    expect(width('±')).toBe(1);
    expect(width('±', { ambiguousIsNarrow: false })).toBe(2);
    expect(width('±×÷')).toBe(3);
    expect(width('±×÷', { ambiguousIsNarrow: false })).toBe(6);
    // A genuinely wide character is wide either way; only the ambiguous one moves.
    expect(width('±你')).toBe(3);
    expect(width('±你', { ambiguousIsNarrow: false })).toBe(4);
  });
});

/**
 * The four `\p{…}` classes are built from source strings (see `width.ts`), which trades the
 * syntax checking a literal gets at build time for ~10 ms of import cost nobody was using.
 * This is the other half of that trade: a typo in any of the four fails here rather than in
 * a user's terminal.
 *
 * Each case is chosen so that **only the class under test can produce the number**. The
 * first draft compared an emoji against `'ab'` and both measured 2, so it passed whatever
 * the regex did — a test that could not fail is the thing this file exists to catch.
 */
describe('the Unicode classes survive being built from strings', () => {
  it('invisible: an invisible character occupies no column', () => {
    expect(width('\u200B')).toBe(0);
  });

  it('invisible: an invisible prefix does not add to its cluster', () => {
    expect(width('\u200B\u0915')).toBe(width('\u0915'));
  });

  it('RGI emoji: a ZWJ sequence is one two-column cluster, not four', () => {
    expect(width('\u{1F469}\u200D\u{1F4BB}')).toBe(2);
  });

  it('spacing mark: it takes a column of its own, unlike a nonspacing mark', () => {
    expect(width('\u0915\u0903')).toBe(width('\u0915') + 1);
  });

  it('extended pictographic: a lone pictograph is two columns', () => {
    expect(width('\u{1F600}')).toBe(2);
  });
});

/**
 * The two East Asian Width tables are generated, and this is what keeps them generated.
 *
 * `WIDE` was transcribed by hand and its comment said Unicode 17 while it held less: 1,147
 * code points in 19 runs that `get-east-asian-width` 1.7.0 — and so `string-width` — calls
 * two columns, this called one, and no test noticed, because the graded suite has no case in
 * those blocks. `--check` compares the committed tables with a sweep of the pinned package,
 * so the next Unicode bump fails here instead of drifting.
 */
describe('the width tables are the ones the pinned get-east-asian-width publishes', () => {
  it('generate-width-tables.mjs --check passes', () => {
    const script = fileURLToPath(new URL('../scripts/generate-width-tables.mjs', import.meta.url));
    const run = spawnSync(process.execPath, [script, '--check'], { encoding: 'utf8' });
    expect(run.status, `${run.stdout}${run.stderr}`).toBe(0);
  });

  it('measures a Unicode 17 wide code point as two columns, as string-width does', () => {
    // U+18D80, the first of the 115 in the U+18D80 run the hand-written table was missing.
    // Node 24's regex data is Unicode 16, so nothing else in this file can see it.
    expect(width('\u{18D80}')).toBe(2);
    expect(stringWidth('\u{18D80}')).toBe(2);
  });
});

/** Every string of length 0 to `max` over `alphabet`. */
function* strings(alphabet: readonly string[], max: number): Generator<string> {
  let layer = [''];
  yield '';
  for (let length = 1; length <= max; length += 1) {
    const next: string[] = [];
    for (const prefix of layer) for (const character of alphabet) next.push(prefix + character);
    yield* next;
    layer = next;
  }
}

function elapsed(fn: () => unknown): number {
  const t = performance.now();
  fn();
  return performance.now() - t;
}

/**
 * A run of combining grapheme joiners could hang `width()`. The zero-width test was
 * `^(?:DI|Control|Format|Mn|Me|Surrogate)+$`, and `U+034F` is both Default_Ignorable and a
 * nonspacing mark, so a run of them before one visible character backtracked exponentially.
 * Measured on the unfixed code, Node 24.21, macOS, under load: 20 / 22 / 24 / 26 joiners
 * before `U+0903` took 39 / 154 / 614 / 2,381 ms — two more joiners, four times the time — and
 * 1,000 did not finish in ten minutes. string-width 8.3.0's suite added 1,000 and 3,000,000.
 * The fix measured 0.6 ms and 203 ms for those on the same machine. The budgets sit 5-10x
 * over that linear cost, so a slow runner stays green, and unimaginably far under the
 * exponential one, so a reintroduced backtracking pattern cannot.
 */
describe('zero-width clusters are measured in linear time, and as the regexes measured them', () => {
  /** The two regexes `leadingInvisible` replaced, exactly as `width.ts` used to build them. */
  const zeroWidthCluster = new RegExp(`^(?:${INVISIBLE_CLASSES.join('|')})+$`, 'v');
  const leadingNonPrinting = new RegExp(`^[${INVISIBLE_CLASSES.join('')}]+`, 'v');

  it('matches both regexes on every short string of the six classes and the characters beside them', () => {
    const alphabet = [
      '\u034F', // COMBINING GRAPHEME JOINER: Default_Ignorable *and* Nonspacing_Mark — the overlap
      '\u200B', // ZERO WIDTH SPACE: Format and Default_Ignorable
      '\u0007', // BEL: Control
      '\u0600', // ARABIC NUMBER SIGN: Format, not Default_Ignorable
      '\u0301', // COMBINING ACUTE ACCENT: Nonspacing_Mark
      '\u20DD', // COMBINING ENCLOSING CIRCLE: Enclosing_Mark
      '\uD83D', // a lone high surrogate, which pairs with the next one into U+1F600
      '\uDE00', // a lone low surrogate
      '\u0903', // DEVANAGARI SIGN VISARGA: a spacing mark, which is visible
      'a',
      '\u{E0001}', // LANGUAGE TAG: Format and Default_Ignorable, outside the BMP
    ];
    const mismatches: string[] = [];
    let checked = 0;
    for (const s of strings(alphabet, 5)) {
      const skipped = leadingInvisible(s);
      const zero = s !== '' && skipped === s.length;
      if (zero !== zeroWidthCluster.test(s) || s.slice(skipped) !== s.replace(leadingNonPrinting, '')) mismatches.push(JSON.stringify(s));
      checked += 1;
    }
    expect(mismatches.slice(0, 10)).toEqual([]);
    expect(checked).toBeGreaterThan(170_000);
  });

  it('measures 1,000 joiners before a visible character in well under the exponential cost', () => {
    width('\u034F\u0903'); // the property classes are built on first use; that is not the cost under test
    expect(elapsed(() => expect(width(`${'\u034F'.repeat(1000)}\u0903`)).toBe(1))).toBeLessThan(100);
    expect(elapsed(() => expect(width(`${'\u034F'.repeat(1000)}\u{1F3FB}`)).toBe(2))).toBeLessThan(100);
  });

  // About 0.2 s on a laptop and 2–3 s on a shared CI runner (2,100 ms on ubuntu, 3,108 ms on
  // macos, 2026-09-29). The regex this replaced did not finish 1,000 joiners in ten minutes, so
  // 15 s still fails any return of the backtracking by orders of magnitude.
  it('measures 3,000,000 joiners without backtracking or a RangeError', { timeout: 60_000 }, () => {
    expect(elapsed(() => expect(width(`${'\u034F'.repeat(3_000_000)}\u0903`)).toBe(1))).toBeLessThan(15_000);
    expect(elapsed(() => expect(width('\u034F'.repeat(3_000_000))).toBe(0))).toBeLessThan(15_000);
  });
});
