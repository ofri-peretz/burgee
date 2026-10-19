# Intent — A live frame never outgrows the terminal

> Stage 1 artifact. Opened from the wave-3 ranking
> ([`next-wave-3-2026-10.md`](../../research/next-wave-3-2026-10.md)). Every incumbent in the
> output stack rediscovers the same defect: a live region taller than the screen cannot be
> repainted. flagstaff's seam leaves it to the caller, and caique draws every choice.

**Status:** shipped · **Opened:** 2026-10-12 · **Owner:** @ofri-peretz · **Shipped:** 2026-10-18 on [`1013b65db5`](https://github.com/ofri-peretz/burgee/commit/1013b65db5), verified against `main` at `1013b65db5` — all 3 criteria locked by `projection.test.ts`, caique's `raw.test.ts` and the graded suites

---

## What is wanted

- **flagstaff's frame loop clips the live frame to the terminal's rows**, read at every paint so
  a resize is honoured. The lines that do not fit are summarised in one dim line (`… 12 more`)
  rather than scrolled into history, where they could never be repainted. The static projection
  (a pipe, CI, an agent) is untouched: it never repaints, so it prints every line.
- **caique's `select` and `multiselect` window their choices** to fit the screen, keep the
  cursor in view, and show how many sit above and below.

## Why now

- **The defect is named in the code.** `packages/flagstaff/src/projection.ts` lines 66–68:
  *"A frame taller than the terminal cannot be reached above its top row; that is the
  terminal's limit, and a caller lays out within its height."* `renderList` in
  `packages/caique/src/raw.ts` (line 114) maps every choice to a row with no window, so a list
  longer than the screen breaks the cursor-up repaint.
- **Demand, across five incumbents** (`.sdlc/research/output-stack-open-issues.md` §4 and §12):
  log-update #51 (5 reactions), ora #121, listr2 #720 (2 reactions, 8 comments in the dump:
  windowing "evaluated and not adopted for v11, so that remains a known limitation"), listr2
  #744, ink #973 (8 comments), and clack #236 (`maxItems` on grouped multiselect, 2 reactions).
  The research note concludes *"the loop clips to `rows`"*, and that line is unbuilt.
- **It is a correctness bug, not a feature.** A frame that outgrows the screen leaves garbage
  lines that the next paint cannot reach, in every terminal.

## Affected users and systems

- `packages/flagstaff`: `loop.ts`, `projection.ts` (the writer reads `rows`).
- `packages/caique`: `raw.ts` (`renderList`), and the clack port's `select` / `multiselect` if
  it does not already window (`maxItems` exists in clack 1, so the port keeps clack's own
  behaviour and is not changed by this intent).
- `packages/controlroom` paints through the same writer, so it inherits the clip.

## Constraints

- **Graded drop-ins keep their incumbent's behaviour.** `flagstaff/log-update`, `flagstaff/ora`
  and `caique/clack` are graded byte for byte. The clip applies to flagstaff's native loop and
  caique's native prompts, and to a drop-in only where its incumbent already clips.
- **The static projection never truncates.**
- **No new frame cost on the common path.** A frame shorter than the screen is written as now.

## Success criteria

1. A 50-line frame on a 20-row terminal paints 19 lines plus one summary line, and a resize to
   60 rows repaints all 50.
2. A 40-choice `select` on a 10-row terminal paints a window with the cursor in it, and moving
   past the edge scrolls the window.
3. The graded suites are unchanged.

## Shipped — 2026-10-18

**Status raised to `shipped`.** Every criterion was checked against `main` at `1013b65db5` in the
roadmap-to-shipped Batch 0 pass (`.sdlc/research/roadmap-to-shipped-2026-10.md`).

R2's text in `spec.md` is corrected in this PR to the arithmetic that was built and that criterion
1 states: clip above `rows`, and keep `rows - 1` lines under the summary.

| criterion | check | result |
| :-- | :-- | :-- |
| 1. 50 lines on 20 rows paints 19 plus a summary; a resize to 60 repaints all 50 | `projection.test.ts -t "a live frame never outgrows the terminal"` | 9 passed, 2 skipped |
| 2. a 40-choice select on 10 rows windows around the cursor and scrolls | caique `raw.test.ts -t "a list prompt never outgrows the terminal"` | 5 passed, 40 skipped |
| 3. the graded suites unchanged | `npm run compat -- ora log-update` and `-- clack` | ora 99 / 99, log-update 99 / 99; clack clack 16 / 16 |

Weight budgets (D-20261013-frames-fit-the-screen-budgets): flagstaff `weight.test.ts` in
98 passed; caique `weight.test.ts` 45 passed.

## Open questions

- Which end of the frame is kept. **Answered 2026-10-12 in `spec.md`**: the tail, because a
  live region's newest lines (the active task, the latest log line) are the ones that change.
  The summary line goes at the top.
- Whether the prompt window size is configurable. **Answered 2026-10-12 in `spec.md`**: yes, as
  `maxItems`, the name clack uses, capped by the screen.
