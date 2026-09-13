# linegauge

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
