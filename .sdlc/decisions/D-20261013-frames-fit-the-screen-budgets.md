---
id: D-20261013-frames-fit-the-screen-budgets
subject: 'frames-fit-the-screen R1–R5 do not fit four per-entry weight budgets (B-20261012-frames-fit-the-screen-budgets): are they raised, or is the build held?'
taken: 'Taken — on the owner''s delegation of budgets and baselines (2026-10-12), restated for this intent in the wave 3 step 5 instruction of 2026-10-13: trim first, then raise each budget to the post-trim measurement rounded up to the next 50 B, never more'
date: '2026-10-13'
superseded_by: —
---

**Raised, at the post-trim measurement rounded up to the next 50 B.** `flagstaff` `.` 29,300 ->
30,100 and `./loop` 7,000 -> 7,750 (R1–R3, R5); `caique` `.` and `./raw` move with R4 in the PR
that builds it, and their figures are added to this file there. Budgets are ratchets the owner
raises; the owner delegated that call, and this is the delegation used.

**Value gained.** A live frame taller than the terminal no longer corrupts the screen. Before
this, `frameWriter` repainted by climbing as many rows as it had painted, and a terminal stops a
climb at its top row: a 50-line frame on 20 rows climbed 49, landed 30 rows short, and every
repaint left a stale copy of the frame in scrollback that no later paint could reach. Now the
writer reads `rows` at every paint (R1), paints the frame's tail under one dim `… N more` line
(R2), writes the whole frame once on `release` so nothing the frame held is lost (R2), repaints
from the top when the height changes (R3), and never touches the static projection a pipe, CI or
an agent reads (R5). Every live thing that paints through the seam inherits it: `hoist`ed
components, `tasks`, log tails, controlroom screens. caique's native `select` and `multiselect`
get the same guarantee by windowing their choices (R4).

**What the incumbents do, measured 2026-10-13** with a fake TTY stream (`isTTY`, `rows`,
`columns: 80`), a 50-line frame on 20 rows for the output libraries and 40 choices on 10 rows
for the prompts, counting the lines and the cursor-up rows in each frame written:

| incumbent | taller than the screen |
| :-- | :-- |
| `log-update@8.0.0` | keeps the last 19 lines (32–50), no summary line; `done()` writes nothing more, so lines 1–31 are never shown |
| `listr2@11.2.0` (default renderer) | keeps the last 19 lines live, no summary line; the final frame is written whole (50 lines) |
| `ora@9.4.1` | keeps the **first** 19 lines and replaces the last with `... (content truncated to fit terminal)`, so the changing tail is the part hidden |
| `@inquirer/select@5.2.6` | a fixed window of 7 choices (`pageSize`), whatever the height; no count of what is hidden |
| `@clack/prompts@1.8.1` `select` | a window that fits the rows, with `...` rows for what is hidden |

So the clip is not novel: the newest log-update and listr2 already keep the tail, and ora keeps
the head. What flagstaff adds over them is the `… N more` count and, over log-update, the whole
frame on release. The intent's issue citations (log-update #51, ora #121, listr2 #720) describe
older majors; the measured rows above are the current ones.

**Bytes paid, measured with `weight.test.ts`'s walk over built `dist/` (comments stripped):**

| entry | main | budget | after | paid | new budget |
| :-- | --: | --: | --: | --: | --: |
| `flagstaff` `.` | 29,270 | 29,300 | 30,065 | +795 | 30,100 |
| `flagstaff/loop` | 6,910 | 7,000 | 7,706 | +796 | 7,750 |

All of it is `projection.js`. The trim before measuring took the first build's 857 B to 796:
the width and height kept as one key, the release reusing `diff`'s full-repaint path with no
second measurement, and the row walk folded into one loop. The `… N more` summary is not shared
with caique: caique does not depend on flagstaff, and adding that edge to save bytes is ruled
out. `check:artifacts` passes, so no tarball baseline moves for flagstaff.

**What the incumbent pays for the same behaviour.** log-update 8.0.0's `getFrameHeight` and
`fitToTerminalHeight` are 1,147 B of shipped source (comments removed), and they call
`slice-ansi` and `string-width`, which are not counted; ora 9.4.1's head-clip is 354 B. flagstaff
pays 796 B for the clip, the summary, the release flush and the height-change repaint, over
`linegauge`'s `lineCount`, which the seam already reached.

**Reversal.** Revert the R1–R3 change to `packages/flagstaff/src/projection.ts` and lower the two
budgets back to 29,300 and 7,000 (lowering needs no permission). The tests in
`projection.test.ts`'s `a live frame never outgrows the terminal` block go with it, except R5,
which holds today's static bytes and should stay.
