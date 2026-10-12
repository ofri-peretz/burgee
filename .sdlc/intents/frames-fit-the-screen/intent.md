# Intent — A live frame never outgrows the terminal

> Stage 1 artifact. Opened from the wave-3 ranking
> ([`next-wave-3-2026-10.md`](../../research/next-wave-3-2026-10.md)). Every incumbent in the
> output stack rediscovers the same defect: a live region taller than the screen cannot be
> repainted. flagstaff's seam leaves it to the caller, and caique draws every choice.

**Status:** approved · **Opened:** 2026-10-12 · **Owner:** @ofri-peretz

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

## Open questions

- Which end of the frame is kept. **Answered 2026-10-12 in `spec.md`**: the tail, because a
  live region's newest lines (the active task, the latest log line) are the ones that change.
  The summary line goes at the top.
- Whether the prompt window size is configurable. **Answered 2026-10-12 in `spec.md`**: yes, as
  `maxItems`, the name clack uses, capped by the screen.
