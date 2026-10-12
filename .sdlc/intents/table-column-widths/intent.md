# Intent — A table column can be capped, and say what happens past the cap

> Stage 1 artifact. Opened from the wave-3 ranking
> ([`next-wave-3-2026-10.md`](../../research/next-wave-3-2026-10.md)). The most-reacted open
> issue in cli-table3 asks for a per-column maximum. flagstaff's native table offers a width
> for the whole table and nothing per column.

**Status:** approved · **Opened:** 2026-10-12 · **Owner:** @ofri-peretz

---

## What is wanted

`flagstaff/table`'s native `table()` takes `columns`: per column, `min`, `max` and `overflow`
(`'wrap'`, the default and today's behaviour, or `'truncate'`, which ends the cell in `…`).
A column with `max` never grows past it, whatever its content. A column with `min` is never
narrowed below it while another column can give way. The fitting rule that already exists
(shrink the widest column one cell at a time) runs within those bounds. The static projection,
the `header: value` lines an agent or a pipe gets, is unchanged: it has no columns to cap.

## Why now

- **Demand.** cli-table3 #57, *"Is it possible to set maxWidth for column?"*: open since
  2018-10-11, re-read on github.com 2026-10-12, with **11 reactions** in the 2026-09-08 dump
  (`.sdlc/research/issues/output-stack/cli-table_cli-table3.json`). It is the most-reacted issue
  in that dump. cli-table3 never shipped it: `colWidths` is a fixed width, not a cap.
- **The tree has no per-column control.** `TableOptions` in
  `packages/flagstaff/src/table.ts` (lines 28–41) is `head`, `width`, `align` and `terminal`.
  `fitWidths` (line 82) narrows the widest column first, so a long URL column and a
  two-character status column are treated alike until the URL column is no longer the widest.
- **Agents and people read the same table differently.** A truncated ID in a person's view is
  fine when the full value is in `--json`. Today the only way to keep a column narrow is to
  pre-truncate the data, which then reaches the static projection truncated too.

## Affected users and systems

- `packages/flagstaff/src/table.ts` and its tests.
- `flagstaff/cli-table3` is not changed. Its behaviour is cli-table3's and is graded
  (`cli-table3` 1 in the 2026-10-12 CI reading), and cli-table3 has no cap to match.

## Constraints

- **Today's tables are unchanged.** No `columns` means exactly the current layout, held by the
  existing snapshot tests.
- **Truncation is by display width**, through `linegauge/truncate`, so wide characters and
  styled text are cut correctly. A linked cell keeps its link around the surviving text, as
  `layoutRow` already does after wrapping (cli-table3 #338).
- **The static projection is never truncated.**

## Success criteria

1. A table with `columns: [{ max: 12, overflow: 'truncate' }]` draws its first column at most
   12 cells wide, ending long values in `…`, and the static projection prints them whole.
2. `min` holds while another column can shrink, and the table still fits `width`.
3. The existing table and cli-table3 tests pass unchanged.

## Open questions

- What happens when the mins add up to more than `width`. **Answered 2026-10-12 in
  `spec.md`**: the mins win and the table is wider than asked, the same choice `MIN_COLUMN`
  already makes. A cap the author set is never silently broken to meet a default width.
- Whether `max` counts the padding. **Answered 2026-10-12 in `spec.md`**: no. It is the
  content width, as `width()` measures it, so the number matches what the reader sees.
