---
id: D-20261113-string-width-9
subject: 'string-width 9.0.0 (2026-11-11) rewrote how a cluster is measured, while slice-ansi 10.0.1, wrap-ansi 10.0.2 and cli-truncate 6.2.0 still depend on string-width ^8. Which rules does each linegauge surface follow, and is a string-width 8 entry needed?'
taken: 'Taken — the owner''s request to close #1538 and #1541: "we should be compatible with our competitors, and be better than them"'
date: '2026-11-13'
superseded_by: —
---

**Each surface follows the incumbent it replaces.** The root's `width` (and so its default export,
`measure` and `lineCount`) follows string-width 9.0.0. A new entry, `linegauge/v8`, is string-width
8.3.0's measurement, unchanged from what the root was. `slice`, `wrap`, `truncate`, `widest` and the
`cli-truncate` and `widest-line` façades measure with it, because every incumbent they replace still
resolves string-width 8, and so do burgee, caique, controlroom and flagstaff.

Measured on darwin arm64, Node 24.13.0, 2026-11-13.

| Suite | Control | linegauge before | linegauge after |
| :-- | --: | --: | --: |
| string-width 9.0.0 (`linegauge`) | 466 / 466 | 308 / 466 | **466 / 466** |
| string-width 8.3.0 (`linegauge/v8`) | 233 / 233 | 233 / 233 (as the root) | **233 / 233** |
| slice-ansi 10.0.1 (`linegauge/slice`) | 129 / 129 | 129 / 129 | **129 / 129** |
| wrap-ansi 10.0.2 (`linegauge/wrap`) | 85 / 85 | 85 / 85 | **85 / 85** |
| cli-truncate 6.2.0 | 17 / 17 | 17 / 17 | **17 / 17** |
| widest-line 6.0.0 | 1 / 1 | 1 / 1 | **1 / 1** |

The 9.0.0 suite has 424 test names, and its templated tests expand them to 466 cases. That is the
count the oracle grades.

## Why one measurement could not serve both majors

With 9's rules everywhere, slice-ansi read **128 / 129**. Its `counts columns the same way as
string-width` case asserts 8's answers: `sliceAnsi('A🇦B', 1, 2)` is `🇦`, a lone regional
indicator being one column, and `ᄀ가` is four columns. 9 measures them as 2 and 2. The suite pins
`string-width@8.3.0`, so the case is the incumbent's own behaviour and not a stale fixture.
`slice-ansi`, `wrap-ansi` and `cli-truncate` cannot pass both, and the root cannot pass
string-width 9's suite with 8's rules (308 / 466). So there are two measurements, each graded by the
suite of the release it follows.

`linegauge/v8` is also why burgee, caique, controlroom and flagstaff now import `width`, `measure`
and `lineCount` from it. Those packages wrap and slice with `linegauge/wrap` and `linegauge/slice`,
which measure by 8. A box padded by 9's `width` around rows folded by 8's `wrap` would be a column
out on exactly the clusters that moved. Their output is unchanged, and so is every suite they are
graded by: the full active run after the change reads level on every host it read level on before.

## The v8 entry

**Kept and claimed.** `SUPPORTED_MAJORS['string-width']` is `[8, 9]`, and
`PREVIOUS_MAJOR_ENTRIES['string-width'][8]` is `linegauge/v8`. So `burgee migrate` rewrites a
project on string-width 8 to the entry that measures as 8 did. The claim on 8 had been graded
level since 2026-09-28. A bump does not end a claim: the claim is graded level or it is withdrawn,
as with slice-ansi 7. Here the measurement already exists because `slice` needs it, so the entry costs
one re-export file (`dist/v8.js`, 74 B).

The `string-width-8` row in `PREVIOUS_MAJORS` vendors 8.3.0's suite at its tag. Its control is the
workspace root's string-width, which stays `^8.3.0`. Moving the root to 9 would nest a copy of 8
under slice-ansi, wrap-ansi, cli-truncate, widest-line, boxen and ink. The string-width row instead
installs 9.0.0 beside its suite (`suiteDeps`), as `slice-ansi-7` does for 7.1.2, and `benchmarks`
pins `string-width@9.0.0` for the weight and runtime comparisons.

## The port

`src/width9.ts` follows string-width 9.0.0's `index.js` rule by rule. It shares the East Asian Width
tables, the ASCII shortcut and the plugin seam with `width.ts`, through `claimOf`, a one-line
export. The rules:

- a lone surrogate is `U+FFFD`;
- a spacing prepended concatenation mark is a column unless a wide glyph takes it in;
- a cluster opening with Hangul is the width of its first code point;
- an emoji prefix is two columns, which includes a lone or unpaired regional indicator and a
  digit with `U+FE0F`;
- a wide BMP emoji with `U+FE0E` is one column;
- a stray skin tone is a two-column swatch;
- anything else is the sum of its visible code points up to a joiner;
- a run of Kirat Rai vowels is one glyph.

`width9.test.ts` states 26 inputs on which 9.0.0 and 8.3.0 disagree, with both answers taken from
the real packages. With the root's `index.ts` checked out at the unported commit, **29 of the
file's 35 root cases fail**. The other six are cases where the two majors agree, kept as locks.
The same 26 inputs hold `linegauge/v8` to 8's answers.

## Weight and speed

The figures are from `npm run bench -- --axis weight --axis runtime --axis perf`, run against
`string-width@9.0.0`, which `benchmarks` now pins. The machine was loaded (load average 35-60).

| | linegauge | string-width 9.0.0 | gate |
| :-- | --: | --: | :-- |
| one symbol, bundled and minified | 6,707 B | 6,845 B | ratio 0.980, at most 1 |
| 1,000 mixed lines, runtime ratio | 0.749 | 1 | at most 0.85 |
| cold start | 40.4 ms | 57.45 ms | delta -15.75 ms, at most 0 |
| installed, with dependencies | 116,780 B | 45,582 B | none |

**The first port was slower, and the gate caught it.** With 9's rules ported as they are written,
the runtime ratio read 1.372 against the 0.85 gate. string-width 9 is faster than 8 was: the
unchanged 8.3.0 measurement reads 1.21 against it on the same fixture. 9 skips the segmenter for
printable ASCII at either end of a string.

`measure` now does that for every code unit that is a cluster of its own whatever stands before
it (`ALONE`): ASCII, Latin-1 less the soft hyphen and two pictographs, CJK punctuation and kana
less the marks that combine, Han, Hangul syllables, and the halfwidth and fullwidth forms. Only
the stretch between the two ends is segmented, and only once. A line of Japanese is never
segmented. A throwaway probe that timed each of the fixture's seven line shapes alone read 0.17 of
string-width 9's time on that line, against 1.41 before. The probe is not committed, and only the
ratio in the table is the bench's.

**Weight.** That fast path first measured 7,200 B, heavier than string-width. The property
classes now use their short aliases (`DI`, `Cf`, `EMod`), and the code-unit tests are two
regex classes rather than a function of named bounds. That brought the bundle to 6,707 B. The B4
ceiling moves 5,950 -> 6,800: the measured figure plus the 80 B CI margin, rounded up to the
next 50. The ratio gate stays at 1.

**Installed, linegauge is the larger package.** It carries the six drop-ins, and now two width
measurements. The foundation band moves 108,568 -> 116,780 against the 194,329 B of the
incumbents it replaces (0.6009). `ceilings.json` moves `cli-truncate.js` 35,864 -> 35,909 and
`widest-line.js` 12,236 -> 12,284 for `claimOf`, and records `v8.js` at 11,999.
