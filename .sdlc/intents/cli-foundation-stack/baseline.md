# The foundation tier's competitive baseline — measured 2026-09-10

> Companion to [`intent.md`](./intent.md). Its success criteria promise four packages that
> beat their incumbents; this file is the number each of those claims has to clear, taken
> from this repo's own installed tree on 2026-09-10. Regenerate the tables with
> `npx tsx scripts/foundation-baseline.ts`.

## State of the tier

**Nothing is built.** `linegauge`, `closeout`, `seniority` and `bellpull` are each a
seven-line stub at `0.0.1` exporting their own name, and all four intents are `draft`. The
Design→Build gate (working agreement rule 3) has not been passed on any of them, so what
follows is what a build would have to clear, not work in flight.

Of the four wave gates in `intent.md`, only **F1's is met** — the scoreboard is public. F2
waits on F1 landing, F3 on F2 shipping, and F4 on the `tinyexec` kill gate, which the
measurement below answers.

## Three findings, and two of them narrow the case rather than widen it

### 1. `string-width` is not wrong. The width claim has to move.

`linegauge/intent.md` asks for the grapheme table "reproduced as a **passing test file** —
six rows where every incumbent gets at least one wrong." Measured, that is **false for
`string-width`**, which gets all six right. It is true, and badly so, of the two width
oracles underneath it: `wcwidth` misses four of six and `eastasianwidth` misses four of six.

So the pitch is not *"string-width is wrong"* — it is *"the 43.9 M/wk oracle much of the
ecosystem still resolves to is wrong, and `string-width` is right because it stopped using
it."* A real claim, and a different one. Rewrite the criterion before building against it.

### 2. `wrap-ansi` shattered clusters until version 10, which fixed it.

The intent's thesis is *cutting styled text without letting the edge come apart*. Two
family-ZWJ emoji — two graphemes, four columns — hard-wrapped at three columns:

| version | lines out | line widths |
| :-- | --: | :-- |
| `wrap-ansi@8.1.0` | **8** | 3, 3, 3, 2, 3, 3, 3, 2 |
| `wrap-ansi@9.0.2` | **8** | 3, 3, 3, 2, 3, 3, 3, 2 |
| `wrap-ansi@10.0.1` | 2 | 2, 2 |

Eight lines is the cluster coming apart — `👨‍`, `👩‍`, `👧‍`, `👦`, four fragments of one
indivisible grapheme, twice. **Version 10 gets it right**, and version 10 is precisely what
`flagstaff/src/wrap.ts` is already a graded port of (#178).

This is the finding that most narrows the case, so it is worth stating plainly: on both of
the functions the intent leads with, `width` and `wrap`, **the current incumbent is
correct.** What is still true is that 8 and 9 are what this tree and much of the ecosystem
actually resolve to — every `wrap-ansi` reachable here except `log-update`'s is 7, 8 or 9.
"Right on the version people have installed" is a defensible claim. "Right where the
incumbent is wrong" is not, and the README must not make it.

`slice-ansi@9.0.0` still fails the same boundary the other way: `slice(cluster, 0, 1)` — one
column into a two-column cluster — returns the empty string for family ZWJ, regional flag
and keycap alike.

### 3. `tinyexec` has already answered `bellpull`'s kill gate.

`bellpull/intent.md` records three outcomes; the measurement selects one. `tinyexec` ships
**one package and 26 KiB** against `execa`'s **eighteen packages and 632 KiB**. The weight
pitch is gone and is not coming back, exactly as that intent predicted. If `bellpull` is
built, its case is executable resolution and result shape — never bytes — and the README has
to say so.

## Where the tier's case actually is

With correctness against *current* versions off the table for two of `linegauge`'s six
functions, the measurable claim common to all four packages is **consolidation**: one
package where a caller installs many. That is the column to compete on, and it is large.

## What a caller installs today

### What a caller installs today

#### linegauge

| incumbent | version | packages installed | KiB on disk |
| :-- | :-- | --: | --: |
| `string-width` | 5.1.2 | 5 | 125 |
| `wrap-ansi` | 8.1.0 | 7 | 153 |
| `strip-ansi` | 7.2.0 | 2 | 10 |
| `slice-ansi` | 9.0.0 | 3 | 53 |
| `cli-truncate` | 6.1.1 | 9 | 192 |
| `widest-line` | 5.0.0 | 6 | 128 |
| `wcwidth` | 1.0.1 | 3 | 29 |
| **all of them together** | | **14** | **235** |
| **`linegauge` must beat this** | | **1** | **< 235** |

#### closeout

| incumbent | version | packages installed | KiB on disk |
| :-- | :-- | --: | --: |
| `signal-exit` | 4.1.0 | 1 | 75 |
| `exit-hook` | — | *not in this tree* | — |
| `onetime` | 7.0.0 | 2 | 13 |
| `mimic-fn` | — | *not in this tree* | — |
| `cli-cursor` | 5.0.0 | 5 | 95 |
| `restore-cursor` | 5.1.0 | 4 | 91 |
| **all of them together** | | **5** | **95** |
| **`closeout` must beat this** | | **1** | **< 95** |

#### seniority

| incumbent | version | packages installed | KiB on disk |
| :-- | :-- | --: | --: |
| `cosmiconfig` | 9.0.2 | 17 | 1942 |
| `lilconfig` | — | *not in this tree* | — |
| `rc` | — | *not in this tree* | — |
| `dotenv` | — | *not in this tree* | — |
| `c12` | — | *not in this tree* | — |
| **all of them together** | | **17** | **1942** |
| **`seniority` must beat this** | | **1** | **< 1942** |

#### bellpull

| incumbent | version | packages installed | KiB on disk |
| :-- | :-- | --: | --: |
| `execa` | 10.0.1 | 18 | 632 |
| `tinyexec` | 1.3.1 | 1 | 26 |
| `nano-spawn` | — | *not in this tree* | — |
| `which` | 2.0.2 | 2 | 20 |
| `isexe` | 2.0.0 | 1 | 11 |
| `npm-run-path` | 6.0.0 | 3 | 20 |
| `path-key` | 3.1.1 | 1 | 4 |
| **all of them together** | | **21** | **679** |
| **`bellpull` must beat this** | | **1** | **< 679** |

### Width, where the claim is correctness rather than weight

| row | a terminal advances | `string-width` | `wcwidth` | `eastasianwidth` |
| :-- | --: | --: | --: | --: |
| family ZWJ | 2 | 2 | **8** ✗ | **7** ✗ |
| regional flag | 2 | 2 | **4** ✗ | 2 |
| skin tone | 2 | 2 | **4** ✗ | 2 |
| keycap | 2 | 2 | **1** ✗ | **4** ✗ |
| combining | 1 | 1 | 1 | **3** ✗ |
| CJK | 6 | 6 | 6 | 6 |

## Holes in this baseline

Seven named competitors are not in this tree and so are unmeasured: `lilconfig`, `rc`,
`dotenv` and `c12` for `seniority`, `exit-hook` and `mimic-fn` for `closeout`, and
`nano-spawn` for `bellpull`. Four of those are `seniority`'s, the layer with the largest
prize, so its row rests on `cosmiconfig` alone.

The generator measures **the versions this tree installed**, which is the honest number for
"what a caller gets" and the wrong one for "is the incumbent still wrong" — finding 2 is the
whole argument for keeping both. Grading each layer against its *latest* release as well,
and folding the `wrap`/`slice`/`truncate` boundary cases in beside the width rows, is the
next step that would make this ratchet like the rest of the scoreboard.
