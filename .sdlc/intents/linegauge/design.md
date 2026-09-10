# Design — linegauge

Intent: [`intent.md`](./intent.md). Umbrella:
[`cli-foundation-stack`](../cli-foundation-stack/design.md).

**Accepted by the owner (Ofri) on 2026-09-09, at the Design→Build gate**, scoped to **the
move only**: `width` and `wrap` leave `flagstaff` for `linegauge`, carrying the differential
tests that already grade them against `string-width` and `wrap-ansi`; `flagstaff` imports
them and deletes both files; its own suites must pass unchanged. **No new behaviour.**

**Second acceptance, 2026-09-09: R4 `slice`, R6 `truncate`, R7 `widest`**, built on the
style stack extracted from `wrap.ts` — which is the consolidation this design is named for,
now done rather than described. R2's fast path, R3's exported `strip`, R9's ceilings and
R10's vendoring stay at the gate and need their own acceptance. The reason for taking
the move first is the one the measured section below gives: it is the half that already has
graders, so if `flagstaff` goes red across the deletion we learn the consolidation was
nominal for the price of a move rather than the price of a package.

---

## Requirements

- **R1** `width(s: string): number` — display columns. Strip ANSI, segment graphemes, sum
  per-cluster widths: East Asian Wide and Fullwidth count 2, control and combining marks
  count 0, everything else 1. Emoji presentation sequences count 2.
- **R2 (Y11)** Fast path: if every code unit is `< 0x80` and no `\x1b` is present, the
  answer is `s.length`. Otherwise the full path. The two are locked equal by
  `differential.test.ts` over a corpus that includes the six-row grapheme table, the
  incumbents' own fixtures, and a randomised generator seeded from a recorded seed.
- **R3** `strip(s)` removes CSI, OSC (including hyperlinks, `OSC 8`), and the single-char
  escapes, using `util.stripVTControlCharacters` where it is exact and a local scan where it
  is not — measured, and the divergence recorded rather than assumed.
- **R4** `slice(s, start, end)` cuts in **display columns**, never in code units: never
  splits a grapheme cluster, closes every style open at the cut, and reopens it at the start
  of the next slice. A slice that lands mid-cluster rounds outward, never inward.
- **R5** `wrap(s, cols, opts)` hard-wraps at `cols` display columns, breaking on word
  boundaries when one exists inside the measure and mid-cluster never. Styles reopen per
  line (R4's machinery). `opts.hard` and `opts.trim` match `wrap-ansi`'s semantics, because
  its suite is the grader.
- **R6** `truncate(s, cols, { position: 'start' | 'middle' | 'end', ellipsis })` — the
  ellipsis is measured with R1 and **included in** `cols`, which is the off-by-one every
  hand-rolled truncator gets wrong.
- **R7** `widest(lines: Iterable<string>): number` in one pass, allocating nothing per line.
- **R8 (Y3)** The root default export is `width`, byte-for-byte call-compatible with
  `string-width`'s default, so `overrides: { "string-width": "npm:linegauge@^1" }` resolves.
  `./wrap`, `./slice`, `./truncate`, `./strip` carry the rest; subpath isolation is locked
  the way `roundel`'s is — each `dist/` file imports only itself and `./width.js`.
- **R9 (Y8)** Ceilings, as weight rules: bundled bytes and spawn delta at or under
  `get-east-asian-width` (0 deps, the lightest in the layer). Recorded in
  `.sdlc/bands/foundation-ceilings.json`, ratcheted.
- **R10 (Y7)** `string-width`, `wrap-ansi`, `strip-ansi` and `slice-ansi` suites vendored
  into `compat-oracle` and graded through generated shims, `--control` first.
- **R11 (Y9)** Nothing reads `process.*`. `stdout.columns` is the caller's to pass.
- **R12** ESM with a `default` condition per entry, no top-level await, so
  `require('linegauge')` works via `require(esm)` (K2).

### Evidence

| R | What supports it | Standing |
| :-- | :-- | :-- |
| R1, R2 | `Intl.Segmenter` verified on Node 24 against the six-row table; `wcwidth` (43.9 M/wk) unpublished since 2016-05-30 | measured 2026-09-08 |
| R3 | `strip-ansi` 464 M/wk with 1 dependency (`ansi-regex`, 345 M/wk) — two packages for one scan | measured |
| R4, R5 | `slice-ansi` and `wrap-ansi` both depend on `ansi-styles` + `string-width`; the reopen logic is duplicated in both | measured |
| R6 | `cli-truncate` (36 M/wk) depends on `slice-ansi` and `string-width`; ellipsis-fits is its whole value | measured |
| R9 | the layer's lightest zero-dep incumbent is `get-east-asian-width`, 69 M/wk | measured |
| R2 fast-path threshold | 3.5 µs per `Intl.Segmenter` segmentation of a 50-char string | measured; the crossover point is a **hypothesis until benchmarked** |

## Design

```text
packages/linegauge/src/
  width.ts        R1, R2 — the fast path, the Segmenter path, the width table
  strip.ts        R3
  slice.ts        R4 — the style stack: open, close, reopen
  wrap.ts         R5 — over slice
  truncate.ts     R6 — over slice
  widest.ts       R7
  runtime.ts      the structural Runtime shape (Y9), nine lines, no import
  index.ts        default = width; named re-exports; no side effects
  *.test.ts       per module
  graphemes.test.ts     the six-row table as assertions
  differential.test.ts  fast path vs Segmenter path over the corpus   (R2, Y11)
  weight.test.ts        R9 · shape.test.ts  R8, R11, R12
```

## What is already written, measured 2026-09-09

This design reads as "build a package". Read against the tree, it is mostly "move 746 lines
and add four functions" — and that changes both the order and the risk, so it is recorded
here before the gate rather than discovered during the build.

| R | | Where it is today |
| :-- | :-- | :-- |
| **R1** width | **written** | `flagstaff/src/width.ts`, 131 lines: Unicode 17 W/F table (122 ranges, binary search) over `Intl.Segmenter`, RGI emoji as 2, marks as 0. Graded differentially against `string-width`. |
| **R2** fast path | new | Nothing ASCII-shortcuts today, and there is no differential lock between two paths because there is only one path. |
| **R3** strip | **partly** | `width.ts` calls `stripVTControlCharacters` and stops there. R3's "measured, and the divergence recorded" is unwritten, and there is no exported `strip`. |
| **R4** slice | new | Deliberately absent. `wrap.ts` says so: rows are self-contained after wrapping, "which is why it carries no port of `slice-ansi`". |
| **R5** wrap | **written** | `flagstaff/src/wrap.ts`, 615 lines: a wrap-ansi 10 port including the style stack, graded differentially against the real `wrap-ansi` in `wrap.test.ts`. |
| **R6** truncate | new | `flagstaff/src/cli-table3.ts` has a `truncate`, but it is cli-table3's own and belongs to that port. |
| **R7** widest | new | `width.ts` exports `lineCount`, not `widest`. |

Three consequences.

**The style stack is not "the whole package" any more — it is written and graded.** The
design's central claim is that `slice`, `wrap` and `truncate` are one algorithm worth
writing once. That algorithm exists in `wrap.ts`, against wrap-ansi's own behaviour. What
remains is to expose it as `slice` and to build `truncate` on it, which is a smaller and
much better-evidenced piece of work than the design implies.

**`wrap.ts` moves too, and the design did not say so.** "Order" below deleted only
`src/width.ts`. Moving 615 lines of graded port is the larger half of the extraction and
carries the larger risk: `log-update` depends on wrap's self-contained rows, by name.

**The differential graders come with it.** `width.test.ts` grades against `string-width`
and `wrap.test.ts` against `wrap-ansi`, both already in this repo's tree. R10's vendoring
is then a promotion of two existing graders plus two new ones, not four new ones.

**Order.** `width` + `wrap` **move out of flagstaff with their differential tests** →
`strip` → `slice` (exposing wrap's style stack) → `truncate` + `widest` → vendor the four
suites → `flagstaff` imports and deletes `src/width.ts` **and `src/wrap.ts`** → B4 rows →
the override recipe, behind its pass rate.

**The style stack, which is the whole package.** `slice`, `wrap` and `truncate` are one
algorithm: walk the string, maintain a stack of open SGR parameters, emit graphemes while
inside the requested column range, and at every cut emit the closing sequence for whatever
is open and re-emit the openers on resume. Writing it once is the consolidation; the twelve
incumbents write it three times between them and disagree at the edges.

**How `flagstaff` uses it.** As a same-repo dependency (Y1 permits downward edges from above
the line). `flagstaff/src/width.ts` **and `src/wrap.ts`** are deleted in the same PR that
adds the import, and its box, columns, table, log-update and status-line tests must pass
unchanged — a green suite across that deletion is the internal proof that the consolidation
is real rather than nominal. `log-update` is the one to watch: it carries no `slice-ansi`
port precisely because wrap leaves each row self-contained, so it depends on a property of
`wrap.ts` that no signature expresses.

## Verification

- `npm test -w linegauge` — R1–R7 units, the grapheme table, the differential lock, the
  weight ceiling, the shape lock.
- `npm run compat -- string-width wrap-ansi strip-ansi slice-ansi` — four rows, `--control`
  first, ratcheting.
- `npm test -w flagstaff` **after** the deletion, unchanged.
- **The check that would have caught the original problem.** The original problem is a
  severed grapheme: a naive slice returns half a ZWJ cluster and the terminal prints
  garbage. `graphemes.test.ts` fails on any implementation that measures in code units, and
  `differential.test.ts` fails the moment the fast path and the correct path disagree on any
  corpus input. Both are proven to fail against a deliberately naive implementation checked
  in as a fixture, so the check is known to work rather than assumed to.

## Rejected alternatives

- **Depending on `string-width` and wrapping it.** Rule 2 forbids it, and it would put the
  2016 `wcwidth` width table under our published number.
- **A hand-maintained East Asian width table.** `Intl.Segmenter` plus the ICU data in the
  runtime is the whole reason this package can be six functions; a checked-in table is a
  Unicode-version liability we would own forever.
- **Exporting `ansi-regex`'s regex as public API.** 345 M/wk makes it tempting; a published
  regex is a compatibility contract on its exact matches, forever. Open question in the
  intent, leaning no.
- **`await`-based Segmenter caching or a WASM width table.** Both are optimisations of a
  3.5 µs operation in a process that has already paid Node's 30 ms. Y8's ceilings are the
  gate; neither is justified until a row moves.
- **Taking `emoji-regex` (295 M/wk) as a fifth suite.** It is a data package, not a
  behaviour; segmenting graphemes replaces the need for it rather than reimplementing it.

## Out of scope

- Any drawing: boxes, tables, columns, status lines. That is `flagstaff`.
- Any styling: this package preserves and re-emits escape sequences, it never authors one.
  That is `roundel`.
- Bidirectional text reordering, and terminal-specific width quirks beyond what the four
  vendored suites grade. Both are real; neither is a CLI's problem to solve first.
- Hyperlink (`OSC 8`) *semantics*. `strip` removes them; nothing here interprets them.
