# Design — A controlroom pane scrolls

Intent: [`intent.md`](./intent.md). **Status:** approved.

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
