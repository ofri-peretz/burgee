# Design — A table column can be capped, and say what happens past the cap

Intent: [`intent.md`](./intent.md). **Status:** approved.

**Accepted by the owner, 2026-10-12, by instruction: create and execute.** The instruction and the
evidence are recorded in [`next-wave-3-2026-10.md`](../../research/next-wave-3-2026-10.md).

---

## Requirements

- **R1 — `columns` option.** `TableOptions.columns?: ({ min?: number; max?: number; overflow?:
  'wrap' | 'truncate' } | undefined)[]`, positional like `align`. Invalid bounds (`min > max`,
  negative, non-integer) throw a `TypeError` naming the column.
- **R2 — Bounds in the fit.** `naturalWidths` clamps each column to its `max` first.
  `fitWidths` then shrinks the widest column that is still above its own `min` (or above
  `MIN_COLUMN`). If none is, it stops, and the table is wider than `width`.
- **R3 — `truncate` overflow.** A `truncate` column's cell is cut to one line with
  `linegauge/truncate` (`position: 'end'`, `…`) instead of wrapped. Its link, if any, wraps the
  surviving text.
- **R4 — Static projection unchanged.** The `header: value` lines carry the full cell text
  whatever `columns` says.

## Design

Everything stays in `table.ts`. The bounds enter at the two existing functions, and `layoutRow`
picks `truncate` or `wrap` per column. The component form (`R1` of flagstaff's own spec, a
table as a component) passes `columns` through, as it passes `head`.

Order: R1 and R2 in one PR, then R3 and R4.

## Verification

| R | Check | Shown failing first by |
| :-- | :-- | :-- |
| R1 | `packages/flagstaff/src/table.test.ts`: `min > max` throws | today `columns` is ignored and nothing throws |
| R2 | the same file: a 60-cell URL column with `max: 12` is 12 wide; a `min: 10` column keeps 10 while the URL column shrinks | today the URL column takes what the fit leaves |
| R3 | the same file: a truncated cell ends in `…`, is one physical row, and keeps its OSC 8 link closed | today the cell wraps across rows |
| R4 | the same file, component block: the static lines hold the full value | a mutation that truncates before the static branch fails it |
| graded | `npm run compat -- cli-table3` | unchanged |

## Status

| R | Status | Where | Check |
| :-- | :-- | :-- | :-- |
| R1 | **Built** 2026-10-12 | `table.ts` (`TableOptions.columns`, `ColumnOptions`, checked at the top of `table()`). `min` and `max` only: `overflow` arrives with R3, so no release carries an option that does nothing. A `max` below 1 is refused too, since a zero-width column cannot draw a cell | `table.test.ts` › `R1 · the columns option` (`min > max`, negative, fractional, NaN and `max: 0` each throw a `TypeError` naming `columns[0]`; a hole names `columns[1]`; `[]` and `[{}, undefined]` draw byte-for-byte as no `columns`). Red on main: `expected function to throw an error, but it didn't` |
| R2 | **Built** 2026-10-12 | `table.ts` (`fitWidths`, and the natural widths in `table()`, held to `max`). `dist/table.js` 3,493 → 3,346 B: the file was tightened in the same change, so the root entry, which had 53 B of headroom, has more; no budget moved | `table.test.ts` › `R2 · bounds in the fit` (the 60-cell URL column with `max: 12` is 12; a `min: 10` column keeps 10 while the URL column goes to 5; mins past `width` win). Red on main: `expected [ 60, 2 ] to deeply equal [ 12, 2 ]`, `expected [ 7, 8 ] to deeply equal [ 5, 10 ]`, `expected [ 6, 7 ] to deeply equal [ 12, 12 ]` |
| R3 | Not built | `table.ts` (`layoutRow`) | `table.test.ts` |
| R4 | Not built | `table.ts` (`tableComponent`) | `table.test.ts` |

**Built: 2. Not built: 2.**

## Rejected alternatives

- **Add it to `flagstaff/cli-table3`.** cli-table3 has no cap, so a façade feature would be an
  ungraded extension of a graded drop-in. The native table is where new layout goes.
- **Proportional shrinking.** `table.ts` already records why it was rejected: it narrows the
  columns that were already narrow.
- **Ellipsis in the middle.** It suits paths and not IDs. `end` is the common case, and a
  `position` option can come later if an adopter asks.

## Out of scope

- Multiple header rows (cli-table3 #328) and a header-body border option (#305). The native
  table already draws a rule under the header.
- Throughput at thousands of rows (cli-table3 #68). That is a benchmark row, recorded in the
  wave-3 candidate table.
