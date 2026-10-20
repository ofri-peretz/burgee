# Design — A controlroom pane scrolls

Intent: [`intent.md`](./intent.md). **Status:** shipped (2026-10-19, PR #1156).

**Accepted by the owner, 2026-10-12, by instruction: create and execute.** The instruction and the
evidence are recorded in [`next-wave-3-2026-10.md`](../../research/next-wave-3-2026-10.md).

---

## Requirements

- **R1 — Scroll state.** `ScreenState.scroll: ReadonlyMap<string, number | 'end'>`. A pane with
  no entry, or with `'end'`, is pinned to its bottom. A number is the first visible row.
- **R2 — Scroll actions.** The reducer handles `scroll.up`, `scroll.down`, `scroll.pageUp`,
  `scroll.pageDown`, `scroll.top` and `scroll.bottom` on the focused pane. It clamps to
  `[0, max(0, contentHeight - rectHeight)]`, and a position at the maximum becomes `'end'`. The
  reducer is given the heights by `compose`, which already lays out every rectangle.
- **R3 — `fit` takes an offset.** `fit(lines, rect, offset)` slices from the offset. `'end'`
  slices the last `rect.height` lines.
- **R4 — Default bindings and hints.** The default keymap binds ↑/↓, PgUp/PgDn and Home/End to
  the R2 actions. `hints()` lists them. A pane not at its end shows `↓ N` in its last row.
- **R5 — Resize clamps.** On a size change, every numeric offset is re-clamped. An offset that
  reaches the new maximum becomes `'end'`.
- **R6 — The static projection ignores scroll.** `compose` with `live: false` prints every line
  of every pane, whatever the state.

## Design

Scrolling is reducer state, like focus and collapse. A pane does not know it is scrolled.
`compose` passes each pane's content height and rectangle height into `reduce` through the
action context. The hint row is drawn by `compose` over the pane's last row only when the pane
is live, focused and not at its end.

The design has state and ordering (follow-tail against user scroll, resize between actions),
but every transition is one synchronous reducer call over plain data. Jev's `needs_model`
question is answered low (see `next-wave-3-2026-10.md`), so no `.qnt` is required. The invariant
that would be modelled, offset ∈ [0, max], is instead a property test over random action
sequences.

Order: R1–R3 in one PR, then R4, then R5 and R6.

## Verification

| R | Check | Shown failing first by |
| :-- | :-- | :-- |
| R1, R2 | `packages/controlroom/src/tabs.test.ts`: each action on a 200-line, 20-row pane; a property test over 1,000 random action sequences holds offset ∈ [0, max] | written first: `reduce` returns the state unchanged for `scroll.*` |
| R3 | `packages/controlroom/src/compose.test.ts`: `fit` with an offset and with `'end'` | today `fit` has two parameters and returns rows 1–20 |
| R4 | `tabs.test.ts`: `hints()` lists the scroll keys; `compose.test.ts`: `↓ 180` on the last row | today neither appears |
| R5 | `compose.test.ts`: shrink then grow keeps the view inside the content | the property test fails on a resize-only sequence before the clamp exists |
| R6 | `compose.test.ts`: `live: false` prints all 200 lines with any scroll state | a mutation that applies the offset to the static path fails it |

## Status

Built 2026-10-19 on `fix/controlroom-scroll-pane` (PR #1156), against `main` at `add9c3fd`. Every
check below was run on unchanged `main` first and failed there (21 of the new cases; the rest
are guards that already held), and the changed-lines mutation lane ends at **100%, 180 of 180
mutants killed** (from 94.27% and 99.45% on the first two runs; the survivors became the tests
and deletions in the second and third commits).

| R / S | Status | Where | Check |
| :-- | :-- | :-- | :-- |
| R1 | **Built** | `tabs.ts`: `ScreenState.scroll`, `initial()` gives an empty map; no entry or `'end'` is the bottom | `tabs.test.ts` › `R1 — a pane with no entry is pinned to its bottom`; `compose.test.ts` › `R1 — …`. Red: `Cannot read properties of undefined (reading 'size')`; `expected 'line 1    ' to be 'line 181  '` |
| R2 | **Built** | `tabs.ts`: `SCROLL` (the six actions as `[lines, pages]`), `move`, `settle`; `reduce(state, action, extents)`. `compose.ts`: `extents()`; `screen.ts` hands the reducer the heights as drawn (`sizeOf(true)`) | `tabs.test.ts` › `reduce — scroll`, and the property test over 1,000 seeded sequences of the six actions, resizes and appended lines, offset ∈ [0, max). Red: `Cannot read properties of undefined (reading 'get')`. The property test found a defect in the first build: `scroll.up` on a pane that fits stored `0` instead of `'end'` |
| R3 | **Built** | `compose.ts`: `fit(lines, rect, at = 0)`; past the last page reads as the last page | `compose.test.ts` › `fit — from an offset`. Red: `expected [ 'line 1  ', … ] to deeply equal [ 'line 21 ', … ]` |
| R4 | **Built** | `plugin.ts`: the `default` keymap binds `up`/`down`, `pageup`/`pagedown`, `home`/`end` with labels `scroll`, `page`, `jump`; `tabs.ts` spells them `PgUp`, `PgDn`, `Home`, `End`; `compose.ts` draws `↓ N` over the focused pane's last row while lines are below it | `tabs.test.ts` › `R4 — …` (`↑↓ scroll  PgUp/PgDn page  Home/End jump`); `compose.test.ts` › `S1, R4 — …`, `the hint is drawn for the focused pane only`; `screen.test.ts` › `opens at its bottom, and the default keys move it`. Red: `expected { left: 'tab.prev', …(4) } to match object { up: 'scroll.up', …(5) }`; `expected 'line 20   ' to be '↓ 180     '` |
| R5 | **Built** | `tabs.ts`: the `resize` action moves every entry by `[0, 0]` through `move`; `screen.ts` sends it on the stdout's `resize` before repainting | `tabs.test.ts` › `reduce — resize`; `screen.test.ts` › `R5 — a resize re-clamps the offset…`, `stops listening for resizes when it closes`. Red: `expected 150 to be 'end'`; `expected undefined to be 193` |
| R6 | **Built** | `compose.ts`: `unfold()` gives every column part its content's height when `live` is false, and the frame grows to fit; scroll state is not read there | `compose.test.ts` › `R6 — live: false prints all 200 lines…`, `R6 — a static frame gives each column part its content…`; `screen.test.ts` › `R6 — closing inline settles every line of the pane into scrollback`. Red: `expected [ 'line 1    ', …(18) ] to deeply equal [ …(198) ]` |
| S1 | **Met, read from Home** ([D-20261019-controlroom-scroll-pane-opens-at-tail](../../decisions/D-20261019-controlroom-scroll-pane-opens-at-tail.md)) | R1 opens the pane at its tail, so "shows rows 1–20" is what Home shows; the 20th row carries the `↓ 180` hint (R4). PgDn shows 21–39 with `↓ 160`, End pins it, and a new line at the end is visible while pinned | `tabs.test.ts` › `S1 — …`; `compose.test.ts` › `S1, R4 — …`, `S1 — a new line at the end stays visible…`; `screen.test.ts` › `opens at its bottom, and the default keys move it` |
| S2 | **Met** | | `compose.test.ts` › `S2 — scrolled up, a new line does not move the view, and the hint counts it`. Red: `expected 'line 20   ' to be '↓ 181     '` |
| S3 | **Met** (it already held for a pipe; now also for the settled inline frame) | `screen.ts`'s static session was already whole; R6 makes `compose`'s static frame whole too | `screen.test.ts` › `S3 — piped, the same screen prints all 200 lines, scrolled or not` (a guard: it passed on `main`); `R6 — closing inline…` (red on `main`) |
| S4 | **Met** | R5, plus `fit`'s own clamp | `compose.test.ts` › `an offset past the end is clamped…`; `tabs.test.ts` › `reduce — resize`, the property test |

**Built: 6 of 6. Met: 4 of 4.** Weight: the root entry 20,485 → 24,149 B and `./plugin` 3,965 →
4,246 B, budgets raised to 24,200 and 4,250
([D-20261019-controlroom-scroll-pane-weight](../../decisions/D-20261019-controlroom-scroll-pane-weight.md)).
The spec asked for a property test and not a model, and the reducer bore that out: every
transition is one synchronous call over plain data, and the property test is what found the
one defect.

## Rejected alternatives

- **A `ScrollView` component holding its own offset.** State scattered across components is what
  the reducer design exists to avoid, and the static projection would need to know which
  components to un-scroll.
- **Ink's `overflow: scroll` on `controlroom/ink`.** Ink does not ship it, so there is no suite
  to grade it against, and the drop-in follows ink.
- **A virtual scrollbar column.** It costs a column on every pane, and the `↓ N` hint gives the
  same information in the row the content already has.

## Out of scope

- Mouse wheel and mouse input in general (controlroom out of scope).
- Horizontal scrolling. Lines are truncated by display width, as now.
- Search within a pane.
