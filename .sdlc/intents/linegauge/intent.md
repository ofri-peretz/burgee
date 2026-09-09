# Intent — linegauge: cutting styled text without letting the edge come apart. One package where the ecosystem has twelve

> Stage 1 artifact. Child of [`cli-foundation-stack`](../cli-foundation-stack/intent.md),
> requirements Y2, Y3, Y7, Y8, Y11, Y12. **A standalone product**: its competitors are
> `string-width`, `wrap-ansi`, `strip-ansi` and `slice-ansi`, its README never mentions
> burgee above the fold, and it is useful with nothing else installed.

**Status:** draft · **Opened:** 2026-09-09 · **Owner:** @ofri-peretz · **Name published:** `linegauge@0.0.1`, 2026-09-09

---

## What is wanted

A printer's line gauge is the steel rule marked in picas and points, used to measure a line
of type against the measure it was set to. This is that, for a terminal.

Six functions, zero dependencies, one package:

| Export | Gives you | Replaces |
| :-- | :-- | :-- |
| `width(s)` | display columns, ANSI-stripped and grapheme-correct | `string-width`, `string-length`, `wcwidth`, `eastasianwidth`, `get-east-asian-width` |
| `wrap(s, cols)` | hard wrap that reopens styles on each line | `wrap-ansi` |
| `truncate(s, cols, {position})` | start / middle / end truncation with an ellipsis that fits | `cli-truncate` |
| `slice(s, a, b)` | a substring in display columns, styles closed and reopened | `slice-ansi` |
| `strip(s)` | escape sequences removed | `strip-ansi`, `ansi-regex` |
| `widest(lines)` | the widest of many, in one pass | `widest-line` |

They are one problem, not six: **cutting styled text without letting the edge come apart.**
Slice a styled string naively and you get a dangling escape sequence, half a grapheme, or a
severed ZWJ cluster. Every one of the twelve incumbents solves a slice of it and hands the
rest to a sibling.

## Why now

- **Twelve packages, 2.16 B weekly downloads, one problem.** Several are thin wrappers over
  the others: `string-width` depends on `strip-ansi` and `get-east-asian-width`;
  `widest-line` depends on `string-width`; `cli-truncate` depends on `slice-ansi`. The
  fragmentation is not a market — it is one library that was published in pieces.
- **`wcwidth`: 43.9 M downloads a week, last published 2016-05-30.** Nine years. It is the
  width oracle underneath a large part of the ecosystem.
- **`Intl.Segmenter` does the hard part and nobody uses it.** Verified on Node 24 against
  every case that breaks a naive implementation:

  | input | code units | graphemes |
  | :-- | --: | --: |
  | family ZWJ `👨‍👩‍👧‍👦` | 11 | 1 |
  | regional flag `🇮🇱` | 4 | 1 |
  | skin-tone `👋🏽` | 4 | 1 |
  | keycap `1️⃣` | 3 | 1 |
  | combining `é` | 2 | 1 |
  | CJK `한국어` | 3 | 3 |

  `string-width` declares `engines: ">=20"` and `slice-ansi` declares `>=22`. Both could
  call it today. Neither does. That is Y4's ideal position: the builtin is a **component**,
  and the package composes it.
- **We write this code either way.** `flagstaff/design.md` already schedules `src/width.ts` —
  *"display width of a string (East Asian wide, combining, ANSI-stripped)"* — because rule 2
  forbids depending on `string-width`. Its own design marks that function *"a hypothesis
  until measured against `string-width`"*. Publishing it is the marginal cost of grading and
  polish, not of invention.
- **This repo carries six copies of `string-width`** while publishing nothing that depends
  on it. The override recipe is what fixes that, and it needs this package to exist.

## Affected users and systems

- `packages/linegauge` gains a real implementation; its README, docs section and benchmark
  page compete against `string-width` and `wrap-ansi` directly (Y12).
- `flagstaff` deletes `src/width.ts` and takes `linegauge` as a same-repo dependency. Its
  box, columns and status-line tests must pass unchanged — that is the internal proof.
- `burgee`'s help renderer keeps its own width handling (Y1); the two share a test-vector
  file, the `roundel`/`burgee` contrast-vector precedent.
- `compat-oracle` vendors four suites: `string-width`, `wrap-ansi`, `strip-ansi`,
  `slice-ansi`. Four new scoreboard rows.
- `cli-benchmarks` B4 gains a per-function row and the first override-collapse row.

## Constraints

1. **Grapheme correctness is never traded for speed.** The fast path is an ASCII byte scan;
   `Intl.Segmenter` runs whenever a non-ASCII code unit is present. A differential test over
   a corpus locks the two paths together (Y11).
2. **The ceiling is `get-east-asian-width`** — 0 dependencies, the lightest thing in the
   layer — not `string-width`, which would be a free pass (Y8).
3. **Default export matches `string-width`'s exactly**, because the override makes
   `require('string-width')` resolve to our `main` (Y3). Subpaths carry the rest.
4. Zero external dependencies, ESM with a `default` condition, Node ≥ 24 (U6, K2). Nothing
   reads `process.*` (Y9) — terminal width comes from the caller.
5. **No layout engine, no rendering, no colour.** This package measures and cuts strings.
   Anything that draws is `flagstaff`; anything that styles is `roundel`.

## Success criteria

- Four vendored suites graded, `--control` proving each gate against the real package first,
  four pass rates published and ratcheting.
- Benchmark rows under `get-east-asian-width` on bytes and spawn delta.
- The grapheme table above reproduced as a **passing test file**, not a document — six rows
  where every incumbent gets at least one wrong.
- `flagstaff`'s `src/width.ts` deleted with its own suite unchanged.
- The override recipe published with its pass rate beside it, and CI refusing the page if
  the rate drops below baseline.

## Open questions

- **Does `wrap` reopen styles per line the way `wrap-ansi` does, or emit a closing sequence
  and let the caller re-style?** `wrap-ansi`'s behaviour is what its suite tests, so
  compatibility decides it — but the two differ on trailing whitespace, and its suite may not
  cover the disagreement.
- **Is `ansi-regex` a subpath or an internal?** It is 345 M/wk on its own and a plausible
  override target, but exporting a regex as public API is a compatibility liability forever.
- **What is the honest fast-path threshold?** `Intl.Segmenter` measured 3.5 µs per
  segmentation of a 50-character string. Whether the ASCII scan pays at every input size or
  only above one is a measurement, not a guess.
