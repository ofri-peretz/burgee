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
- **R13** **No plugin key, by design** (`plugin-contract` R5a; PRINCIPLES rule 14). Every
  other layer hosts one because it answers a question with more than one right answer —
  which colour, which glyph, which terminal, where configuration lives, how an executable is
  found. These six functions answer questions with one right answer: `width('古代')` is 4
  because Unicode classes those code points Wide and a terminal gives each two columns. A
  contribution that changed it would not extend linegauge, it would redefine what the
  terminal does for every caller above, and it would do it without an error — a box a column
  short, a table with a phantom column, nothing thrown. It would also land under a published
  pass rate no grader produced, because R10's four suites are the whole correctness argument.
  The two things that do vary are handled without a registry: the Unicode table and the
  segmenter are the platform's and move on a release (R1, graded), and the terminal's width
  is the caller's to pass (R11). If a second correct answer ever appears — an
  ambiguous-width policy some terminal actually needs — it arrives as an option with a
  differential test, not as a key. `packages/linegauge/README.md` carries this in the
  package's own voice, under `## Plugins`, so a reader who never opens this file still finds
  the decision rather than the silence.

### R10 — the four rows, and what every remaining failure is

Measured 2026-09-15, Node 24.18.0, against the suites vendored under
`packages/compat-oracle/vendor/`. The rows and the reasons, not the rows alone: a
compat rate with an uncategorised remainder is a number nobody can act on, and a fix
aimed at an uncategorised failure is a guess.

| Suite | Before | After | What moved |
| :-- | :-- | :-- | :-- |
| `strip-ansi` | 8 / 8 | 8 / 8 | nothing; it was already exact |
| `wrap-ansi` | 80 / 80 | 80 / 80 | nothing; held across the `width` change below |
| `slice-ansi` | 13 / 15 | 14 / 15 | category E closed |
| `string-width` | 201 / 229 | 229 / 229 | categories A–D closed |

#### string-width's 28, categorised

All 28 were one of four defects in `measure()`, and every one of them is `linegauge`
being **wrong** and the incumbent right — this row buys nothing by arguing with its
grader. The categories were written here before a line was changed.

- **A — Hangul conjoining jamo are additive inside one cluster (10 cases: `ᄀᄀ`,
  `ᄀᄀᄀᄀᄀᄀ`, `ᄀ가`, `가ᅡ`, `각ᆨ`, `U+1100 U+1100 VS16`, `U+1100 U+1100 ZWJ`, `ᅡᅡᅡ`, `ᆨᆨ`, and the
  mixed leading-jamo-plus-precomposed-syllable case).** `Intl.Segmenter` joins a run
  of conjoining jamo into **one** grapheme cluster — GB6/GB7/GB8 — and `measure` gave
  the whole cluster the East Asian Width of its first code point, so `ᄀᄀᄀᄀᄀᄀ`
  answered 2 where a terminal draws 12. Modern Hangul composes **L + V (+ T)** into one
  syllable block two columns wide; jamo that do not compose stay additive at their own
  EAW — a leading jamo is Wide (2), a vowel or trailing jamo is not (1). This is the
  only category that needs a state machine rather than a table edit, and it is the
  largest: 10 of 28.
- **B — spacing combining marks occupy a column (3 cases: `U+093E` (Devanagari vowel sign AA) alone, `U+0915 U+093E`,
  `U+0915 U+093F`).** `ZERO_WIDTH_CLUSTER` matched `\p{Mark}`, which is `Mn` **and** `Mc`
  **and** `Me`. Only `Mn` and `Me` are non-spacing; a `Mc` such as Devanagari vowel
  sign AA is drawn in its own column. Two edits: narrow the zero-width class to
  `Nonspacing_Mark | Enclosing_Mark`, and let a trailing `Mc` add its width the way a
  trailing fullwidth form already does.
- **C — non-default-ignorable `Cf` characters are zero-width (3 cases: U+0600 Arabic
  number sign, U+06DD end of ayah, U+070F Syriac abbreviation mark).** These are
  prepended concatenation marks: `Format`, but **not** `Default_Ignorable`, so the
  zero-width class missed them. `measure` then stripped them as leading non-printing,
  found an empty remainder, read code point 0 and charged a column for it. Answering 1
  for a character a terminal does not advance the cursor for is the worst shape of this
  bug — it is invisible until a box is a column short.
- **D — minimally-qualified and unqualified emoji sequences (12 cases: 9 ZWJ sequences
  such as `U+2764 ZWJ U+1F525`, and 3 keycaps such as `U+0023 U+20E3`).** `\p{RGI_Emoji}`
  matches only the **fully-qualified** form — the one carrying `U+FE0F`. Drop the
  variation selector and the same sequence is still what every terminal renders as a
  two-column emoji, but the regex stops matching and `measure` fell through to the EAW
  of the base scalar, which is narrow. The rule that covers both shapes without
  widening anything else: a cluster holding `U+200D` and **two or more**
  `\p{Extended_Pictographic}` scalars is 2, and so is `[0-9#*] U+20E3`. The
  two-pictographic count is what keeps `U+0915 U+094D ZWJ U+0937` — an Indic conjunct joined by the
  same ZWJ — at 1, and the explicit keycap base class is what keeps the invalid
  `U+260E VS16 U+20E3` at 1. Both are cases in the same suite, and both were passing
  before: this category must be closed without moving them.

#### slice-ansi's 2

- **E — an SGR parameter we do not recognise is dropped (`can slice a string with
  unknown ANSI color`).** Ours to fix, and fixed here. `slice-ansi` re-emits **any**
  SGR parameter it saw and closes with a reset, so `ESC[1001m` survives a cut;
  `linegauge`'s style stack tracked only the codes in its own close-code table and
  dropped the rest, returning a bare `TES`. The sequence is the caller's, not the
  library's to vet — a style stack that silently discards what it cannot name is a
  filter nobody asked for. The stack now carries unknown SGR parameters through and
  closes them with `ESC[0m`, which is the only close code that is correct for a
  parameter whose meaning is unknown.
- **F — `slice links` cannot be passed, and should not be.** It is `test.failing()` in
  `slice-ansi`'s own suite: the incumbent cannot round-trip an `OSC 8` hyperlink and
  says so in its source. `linegauge` can, and ava reports a passing `test.failing` as
  `not ok`. **14 / 15 is therefore this row's ceiling**, and the missing point is the
  target being more correct than the host. It is named rather than excluded because an
  ava host's TAP reaches `summarize` through the summary-line dialect and the oracle
  refuses an exclusion it cannot match by name — which is the right refusal: laundering
  this into 15 / 15 would publish a number no grader produced.

### R9 — the ceiling is measured, and it is not met

Measured 2026-09-15, Node 24.18.0, `esbuild --bundle --minify --format=esm`, one fixture
importing one symbol per entry. The full table, its provenance and its caveats live in
`packages/linegauge/ceilings.json`; the numbers that decide the requirement:

| Entry | Bundled | R9's bar (`get-east-asian-width`, 3 977) | D1's bar (what it replaces) |
| :-- | --: | :-- | :-- |
| `index.js` | 6 180 | over, 1.55x | `string-width` 6 057 — **over by 2%** |
| `wrap.js` | 11 116 | over, 2.79x | `wrap-ansi` 14 367 — **under** |
| `slice.js` | 8 778 | over, 2.21x | `slice-ansi` 5 964 — over by 47% |
| `truncate.js` | 9 698 | over, 2.44x | `cli-truncate` — pair not built |
| `widest.js` | 6 251 | over, 1.57x | no incumbent |
| `strip.js` | 966 | **under** | `strip-ansi` 429 — over, on 966 bytes |

**So R9 does not hold: one entry of six clears the bar it names.** That is the finding, and
it is recorded rather than softened. Two things make the number less damning than it reads
and neither rescues it. The incumbent figures are the bundled bytes of **one** package after
tree-shaking, while what a user removes by switching is the **tree** — `string-width` drags
`strip-ansi`, `ansi-regex` and `get-east-asian-width` — and `.sdlc/PLAN.md` D1 already
replaced R9's bar with that tree-inclusive one for exactly this reason. And `get-east-asian-width`
is a width table with no segmenter, no escape scanner and no style stack; asking six
functions to weigh what one lookup weighs was never a comparison of like with like. Both
observations belong in the requirement, not in the result: **R9's bar should be restated as
D1's**, and until it is, this row stays red against the text as written.

The correctness work in § R10 above **made this worse**, which is the half a ceiling file
exists to catch. Closing the 28 `string-width` failures and the one `slice-ansi` failure
added 939–1 040 bytes to every entry that measures or cuts — `index.js` from 5 241 to
6 180, an 18% growth — and `strip.js` alone was untouched. Twenty-nine graded cases for a
kilobyte is a trade worth making and it is still a cost; `ceilings.json` carries the before,
the delta and the after side by side so it cannot be quietly absorbed into a new baseline.

**The published tarball, and whose growth it is.** `npm run check:artifacts` reports
`linegauge` 21.8% over its recorded pack size, and seven packages are over theirs — the
drift that got the check wired in. Split, so the number is actionable rather than
alarming: `.sdlc/bands/artifact-size-baseline.json` records 22 726 gzipped / 68 048
unpacked; `main` already packed **25 060 / 75 115** before this work began, which is 10.3%
of the overrun and none of it ours; this change takes it to **27 682 / 82 636**, the other
10.5%. The baseline is not bumped here. It is `.sdlc/bands/**`, which this lane may not
write, and it should not be bumped per package anyway while seven rows are red at once —
that is one decision about what the layer is allowed to weigh, and it belongs with R9's bar
being restated as D1's, in the integrator lane, in one pass.

**What is built.** `packages/linegauge/src/weight.test.ts` ratchets the `dist/` byte closure
of every published entry and fails when one grows past `ceilings.json` — proven to fail by
lowering a recorded ceiling, not assumed to. It also asserts `y8.holds` is `false`, so the
shortfall above cannot be flipped to a pass without the numbers moving. Its unit is `dist/`
bytes rather than bundled bytes on purpose: bundling needs `esbuild`, which this package does
not depend on and should not, and a check that shells out to an undeclared binary passes for
the wrong reason the first day it is not hoisted where it expected.

**What is not built, and why.**

- `.sdlc/bands/foundation-ceilings.json`, which R9 names, **does not exist**. It is outside
  this lane's write paths — `.sdlc/bands/**` is the integrator lane's — so the entry cannot
  be added from here. `scripts/plan-progress.ts` D1 tests for that file, so this is visible
  in the plan rather than lost.
- `benchmarks/fixtures/entry-points.ts` has **no `linegauge` pair**, so B4 computes no
  tree-inclusive ratio for this package and D1's bar cannot be enforced anywhere yet. Also
  the integrator lane's path.
- **The spawn-delta half of R9 is unmeasured.** It needs the B4 harness above; nothing here
  substitutes for it, and nothing here pretends to.

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
