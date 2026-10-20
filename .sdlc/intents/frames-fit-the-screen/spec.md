# Design — A live frame never outgrows the terminal

Intent: [`intent.md`](./intent.md). **Status:** approved.

**Accepted by the owner, 2026-10-12, by instruction: create and execute.** The instruction and the
evidence are recorded in [`next-wave-3-2026-10.md`](../../research/next-wave-3-2026-10.md).

---

## Requirements

- **R1 — The writer knows the height.** The frame writer reads `rows` from its stream at every
  paint, as it already reads the width. A stream with no `rows` (a pipe) means unbounded.
- **R2 — The live frame is clipped.** A frame with more lines than `rows` is painted as its
  last `rows - 1` lines under one summary line, `… N more`, dimmed through roundel's tokens.
  *(Restated 2026-10-18 to what was built and what intent criterion 1 always said: 19 lines plus
  the summary on 20 rows. The first text clipped above `rows - 1` and kept `rows - 2`, which would
  clip every full-screen controlroom frame; see the note under the build table.)*
  On `release`, the full frame is written to scrollback once, so nothing the user was shown is
  lost.
- **R3 — A resize repaints.** On `resize`, the next paint uses the new height and erases what
  the old one drew. ink #942 is the scrollback-squish case this has to pass.
- **R4 — Native list prompts window.** `renderList` takes `maxItems`, defaulting to
  `rows - 3`, and draws the window around the cursor with `↑ N more` and `↓ N more` rows. Moving
  the cursor past an edge moves the window.
- **R5 — The static projection is untouched.** A test holds the piped output of a 50-line frame
  byte-identical before and after.

## Build status — 2026-10-13

**R1–R3 and R5 built in flagstaff, R4 in caique.** The weight budgets that stopped the
2026-10-12 build were raised under the owner's delegation, after a trim, to the measurement
rounded up to the next 50 B:
[`D-20261013-frames-fit-the-screen-budgets`](../../decisions/D-20261013-frames-fit-the-screen-budgets.md),
which closes [`B-20261012-frames-fit-the-screen-budgets`](../../gaps/B-20261012-frames-fit-the-screen-budgets.md).

| R | Status | Budget | Check, shown failing on main |
| :-- | :-- | :-- | :-- |
| R1 | Built | `flagstaff` `.` 29,300 -> 30,100, `./loop` 7,000 -> 7,750 (+796 B in `projection.js`, with R2 and R3) | `projection.test.ts`: a 50-line frame on 20 rows paints all 50, and a repaint climbs 49 rows |
| R2 | Built | the same | `projection.test.ts`: no `… 31 more`; `release` writes nothing |
| R3 | Built | the same | `projection.test.ts`: the 20 -> 60 resize repaints nothing, so a clipped view would stay |
| R4 | Built | `caique` `.` 20,000 -> 20,700, `./raw` 9,000 -> 9,550 (+652 B in `raw.js`, +72 B in `terminal.js`) | `raw.test.ts`: `renderList` returns 41 lines; the repaint climbs 40 rows on 10 |
| R5 | Built | none (a test) | passes on main by design: a mutation that clips the static path fails it |

Tally: 5 of 5 built.

R2's first text disagreed with intent criterion 1 and this file's Verification row. It clipped
above `rows - 1` and kept `rows - 2` lines; criterion 1 and Verification keep 19 lines plus the
summary on 20 rows. The build followed the latter, and R2 above was restated to match on 2026-10-18 (clip above `rows`, keep `rows - 1` under the
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
