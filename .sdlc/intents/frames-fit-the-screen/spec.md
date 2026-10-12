# Design — A live frame never outgrows the terminal

Intent: [`intent.md`](./intent.md). **Status:** approved.

**Accepted by the owner, 2026-10-12, by instruction: create and execute.** The instruction and the
evidence are recorded in [`next-wave-3-2026-10.md`](../../research/next-wave-3-2026-10.md).

---

## Requirements

- **R1 — The writer knows the height.** The frame writer reads `rows` from its stream at every
  paint, as it already reads the width. A stream with no `rows` (a pipe) means unbounded.
- **R2 — The live frame is clipped.** A frame with more lines than `rows - 1` is painted as its
  last `rows - 2` lines under one summary line, `… N more`, dimmed through roundel's tokens.
  On `release`, the full frame is written to scrollback once, so nothing the user was shown is
  lost.
- **R3 — A resize repaints.** On `resize`, the next paint uses the new height and erases what
  the old one drew. ink #942 is the scrollback-squish case this has to pass.
- **R4 — Native list prompts window.** `renderList` takes `maxItems`, defaulting to
  `rows - 3`, and draws the window around the cursor with `↑ N more` and `↓ N more` rows. Moving
  the cursor past an edge moves the window.
- **R5 — The static projection is untouched.** A test holds the piped output of a 50-line frame
  byte-identical before and after.

## Build status — 2026-10-12

**Not built: R1–R5 do not fit the per-entry weight budgets**, which only the owner raises. Every
check below was written and shown failing on main, and passed once built; the build stopped at
the weight locks. The numbers and the recommended ruling are in
[`B-20261012-frames-fit-the-screen-budgets`](../../gaps/B-20261012-frames-fit-the-screen-budgets.md).

| R | Status | Blocked by | Check, shown failing on main |
| :-- | :-- | :-- | :-- |
| R1 | Not built | `flagstaff` `.` and `./loop` budgets (+777 B in `projection.js`, with R2 and R3) | `projection.test.ts`: a 50-line frame on 20 rows climbs 49 rows |
| R2 | Not built | the same | `projection.test.ts`: all 50 lines painted, no `… 31 more` |
| R3 | Not built | the same | `projection.test.ts`: after 20 -> 60 rows the screen still holds the clipped view |
| R4 | Not built | `caique` `.` and `./raw` budgets (+836 B in `raw.js` and `terminal.js`) | `raw.test.ts`: `renderList` returns 41 lines; the repaint climbs 40 rows on 10 |
| R5 | Not built | held with R2, whose clip it guards | passes on main by design: it is the static path's lock |

Tally: 0 of 5 built.

R2's arithmetic disagrees with intent criterion 1 and this file's Verification row. R2 clips
above `rows - 1` and keeps `rows - 2` lines; criterion 1 and Verification keep 19 lines plus the
summary on 20 rows. The build followed the latter (clip above `rows`, keep `rows - 1` under the
summary), because controlroom's alternate screen paints exactly `rows` lines through
`frameWriter`, and clipping at `rows - 1` would clip every full-screen frame.

## Design

The clip lives in the writer (`projection.ts`), not in each component, so every live thing
inherits it: tasks, log tails, controlroom screens. R2's release-time flush is why the clip loses
nothing: the clipped lines exist in the final frame, and the final frame goes to scrollback
whole. A repaint is impossible above the top row, but a final write is always possible.

Order: R1 and R2 in one PR, R3 next, R4 in caique, R5 alongside R2.

## Verification

| R | Check | Shown failing first by |
| :-- | :-- | :-- |
| R1, R2 | `packages/flagstaff/src/projection.test.ts`: a 50-line frame on a fake 20-row stream paints 19 lines and the summary; `release` writes all 50 | written first: today all 50 are painted and the cursor-up count exceeds the screen |
| R3 | the same file: resize 20 → 60 rows repaints the full frame and erases the summary | today the old summary line remains |
| R4 | `packages/caique/src/raw.test.ts`: 40 choices, 10 rows; the window follows the cursor | today `renderList` returns 41 lines |
| R5 | `packages/flagstaff/src/projection.test.ts`, static block: piped bytes unchanged | a mutation that applies the clip to the static path too fails it |
| graded | `npm run compat -- ora log-update clack` | unchanged |

## Rejected alternatives

- **Keep the head of the frame.** The head is what stopped changing. A task list clipped to its
  head hides the running task.
- **Switch to the alternate screen when a frame grows too tall.** That changes the program's
  mode behind the author's back and loses the scrollback the user expects after exit.
- **Document the limit and leave layout to the caller.** That is the current text in
  `projection.ts`, and the five incumbents' trackers show what it costs.

## Out of scope

- Width overflow. `linegauge` already wraps and truncates by display width.
- Scrolling inside a frame on demand. That is `controlroom-scroll-pane`, a component with its
  own key map. This intent is the framework's guarantee, with no input involved.
