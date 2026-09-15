# linegauge

## 0.3.0

### Minor Changes

- [#303](https://github.com/ofri-peretz/burgee/pull/303) [`fc640dd`](https://github.com/ofri-peretz/burgee/commit/fc640ddec11255c12d1e0948c5b8e99cc3f3263b) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Give `linegauge/strip`, `linegauge/wrap` and `linegauge/slice` a default export, each the
  same function object as the subpath's named export.

  The three packages they replace — `strip-ansi`, `wrap-ansi`, `slice-ansi` — all publish a
  single function as their default, so `import stripAnsi from 'linegauge/strip'` now reads
  exactly like the import it replaces. The root default is untouched and still `width`: that
  one is spent on the `string-width` override recipe and cannot move.

  This is what unblocked grading those three suites. Their tests open with
  `import x from './index.js'`, and without a default the generated shim does not fail a case,
  it fails to link — measured at `# tests 0 / # pass 0 / # fail 2` on eight cases the
  implementation already satisfied. All three now grade: `strip-ansi` 8 / 8, `wrap-ansi`
  80 / 80, `slice-ansi` 13 / 15.

### Patch Changes

- [#316](https://github.com/ofri-peretz/burgee/pull/316) [`c8acb28`](https://github.com/ofri-peretz/burgee/commit/c8acb2848714a1cbe3e26a2f9895d7498fb4f096) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `width` and the style stack now answer what `string-width` and `slice-ansi` answer on
  twenty-nine cases they did not. The `string-width` row goes 201 / 229 → **229 / 229**; the
  `slice-ansi` row goes 13 / 15 → **15 / 15**. `wrap-ansi` holds
  at 80 / 80 and `strip-ansi` at 8 / 8 across the change.

  Four defects in `width`, not twenty-eight cases. **Hangul conjoining jamo** are additive
  inside a grapheme cluster: `Intl.Segmenter` joins a run of them into one cluster, and
  measuring that cluster by its first code point answered 2 where a terminal draws 12. Modern
  Hangul composes L + V (+ T) into one two-column syllable and leaves unmatched jamo at their
  own East Asian Width. **Spacing combining marks** occupy a column — the zero-width class
  matched `\p{Mark}`, which is the spacing marks as well as the non-spacing ones, so
  Devanagari vowel sign AA measured 0. **Prepended concatenation marks** (`U+0600`, `U+06DD`,
  `U+070F`) are `Format` but not `Default_Ignorable`, so they missed the zero-width class and
  were charged a column each — the worst shape of the bug, because a character the cursor never
  advances past is invisible until a box comes out short. And **minimally-qualified emoji
  sequences** — the same ZWJ sequence or keycap without its `U+FE0F` — are still two columns
  in every terminal, but `\p{RGI_Emoji}` matches only the fully-qualified spelling.

  One defect in the style stack, which `slice`, `wrap` and `truncate` share. An SGR parameter
  with no entry in the close-code table — `ESC[20m`, `ESC[1001m` — was **dropped** at a cut, so
  the text survived and its styling did not, silently. It is now carried through and reopened
  like any other style, closed with `ESC[0m`. The sequence is the caller's, not this library's
  to vet.

  Measured cost, stated rather than absorbed: the minified bundle grows 939–1 040 bytes per
  entry that measures or cuts — `linegauge` itself from 5 241 to 6 180 bytes, 18%. `strip` is
  unchanged. `packages/linegauge/ceilings.json` carries the before, the delta and the after,
  and a new `weight.test.ts` ratchets every subpath's `dist/` closure so the next growth cannot
  be silent. That file also records, rather than hides, that R9's weight ceiling is **not met**:
  one entry of six is under the bar the design names.

## 0.2.0

### Minor Changes

- [#186](https://github.com/ofri-peretz/burgee/pull/186) [`3d744d9`](https://github.com/ofri-peretz/burgee/commit/3d744d99d92cdc7fc675ad105e4e4b9c6eebca5f) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `slice`, `truncate` and `widest`, over the style stack extracted from `wrap`. Cutting a
  styled string in display columns never splits a grapheme cluster, never loses a combining
  mark, and closes and reopens whatever styles the cut ran through. `truncate` measures the
  ellipsis and keeps it inside the budget. Published as `linegauge/slice`,
  `linegauge/truncate` and `linegauge/widest`, each isolated from the others.

- [#210](https://github.com/ofri-peretz/burgee/pull/210) [`59d910c`](https://github.com/ofri-peretz/burgee/commit/59d910c1da7bca519bd1c2d5ca43b6c57e260621) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `strip` (R3), and a width bug it found. `util.stripVTControlCharacters` leaves the colon
  form of an extended colour — `ESC[38:2::255:0:0m`, how every truecolor library writes one —
  in the output as text, so `width()` answered 15 for a three-column string. Measured across
  sixteen sequence shapes: Node is exact on fifteen and wrong on that one. Published as
  `linegauge/strip`.

### Patch Changes

- [#213](https://github.com/ofri-peretz/burgee/pull/213) [`ecedfa2`](https://github.com/ofri-peretz/burgee/commit/ecedfa2ed0c7aaed23d77c4d02d7c94156a78ce9) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `width` takes `ambiguousIsNarrow`. East Asian Ambiguous characters — `±`, `×`, `÷`, the
  box-drawing set, Greek and Cyrillic — are one column in a Latin terminal and two in a CJK one,
  and nothing can detect which a terminal is doing, so it is the caller's decision. Default
  `true`, matching the incumbent. The 179-range table is generated from Unicode rather than
  transcribed, with a `--check` that fails on drift. Graded: `string-width` 198 / 229 → **201 / 229**.

- [#224](https://github.com/ofri-peretz/burgee/pull/224) [`ea58e63`](https://github.com/ofri-peretz/burgee/commit/ea58e637ee0ee6cdcc655478f6bef54d854f6c0f) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - docs: the README describes the package that shipped

  It opened with "**Not yet released.** This version reserves the name", under a heading
  reading "What it will be", while `linegauge@0.1.0` was live on npm with a graded
  string-width row on the public compatibility page. Anyone who installed it was told the
  package does nothing.

  Rewritten for someone installing it today: what the five functions are, why they are one
  package rather than twelve, and what "without the edge fraying" actually guarantees — a
  cluster is atomic, a style that was open gets closed, and the ellipsis is counted inside the
  budget rather than added on top.

  `strip` and the ASCII fast path are named as still at the gate, because they are.

- [#205](https://github.com/ofri-peretz/burgee/pull/205) [`93114d3`](https://github.com/ofri-peretz/burgee/commit/93114d33b5ac3f9a0ab3b48506255897af40133b) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `width` keeps the contract `string-width` has always kept. A non-string measures `0` instead
  of throwing — a width function is usually reached with whatever a template produced, which is
  why the incumbent answers rather than making every caller guard — and a new
  `countAnsiEscapeCodes` option counts escape sequences as the characters they are made of.
  Graded: `string-width` 194 / 229 → **198 / 229**.

## 0.1.0

### Minor Changes

- [#182](https://github.com/ofri-peretz/burgee/pull/182) [`28a838f`](https://github.com/ofri-peretz/burgee/commit/28a838f0c1314fb79594d9d8bd8e02de785ea80a) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `linegauge` is real: `width` and `wrap` move out of `flagstaff` into the foundation
  package that was reserved for them (F1, the move only). The default export is `width`,
  call-compatible with `string-width`'s default. `flagstaff` imports them and deletes both
  files; its 227 tests pass unchanged, and B4's bundled bytes are identical to the byte —
  the code went to a different file, not away.

### Patch Changes

- [#193](https://github.com/ofri-peretz/burgee/pull/193) [`8586f58`](https://github.com/ofri-peretz/burgee/commit/8586f58542e7896675c0b6fa8815278f8d22d4a3) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Name the tool the package is named after.

  The npm description opened with "the width of material a saw removes in a cut" — that is a
  _kerf_, a different tool from a different trade. A line gauge is the printer's steel rule
  marked in picas and points, which is what a package that measures typeset width actually
  does. The description is the first line a reader sees on npm, so it may as well be the one
  that explains the name.

  No behaviour change.
