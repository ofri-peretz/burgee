---
id: D-20261112-caique-clack-budget-64400
subject: 'What `caique/clack` may weigh once its colours are painted per frame and nested alike on every Node'
taken: 'Raised, on the owner''s delegation of budgets and baselines (2026-10-12): `./clack` 64,000 -> 64,400 B in `weight.test.ts`'
date: '2026-11-12'
superseded_by: —
---

**`./clack` moves from a 64,000 B budget to 64,400 B. The 718 B it grew buys the same colours
on Node 22.13 as on Node 24, which the nightly matrix grades since #1491.**

Main's scheduled Compatibility cells on Node 22.13.0 went red (#1498) on one `caique/clack`
frame. Two defects met there:

- The list hints (`↑/↓ to navigate`) and the required refusal ("Please select at least one
  option. Press space to select…") were painted once, at import, so their colour was the
  process's when the module loaded, not the stream's when the prompt drew. clack paints them per
  render. They are now functions called per frame.
- Node 22.13's `styleText` ends an outer colour where an inner one closes inside it; Node 24's
  reopens it, as picocolors does for clack. So the yellow refusal lost its colour after its first
  key on 22.13 only. `paint` now applies Node 24's nesting itself and asks `styleText` only
  whether to colour.

## The number

- `./clack` in `packages/caique/src/weight.test.ts`'s walk, on a local build on 2026-11-12:
  **63,602 B** on main (a643df081c), **64,320 B** with the fix: +718 B, all in
  `dist/clack-core.js`, `clack-list.js` and `clack-search.js`, comments already stripped.
- That is 320 B over the 64,000 budget. The budget becomes **64,400**, the measurement rounded
  up to the next 100 B. The paint and hint doc comments were cut to one line each before
  measuring, which took 123 B off the first build. Nothing else was traded.
- Budgets are delegated by the owner (2026-10-12, as in D-20261020-caique-inquirer-prompts-budget),
  and this one was taken on that delegation: correct colour on every supported Node is worth the bytes.

## What a later change does with it

The entry still stands at about 0.63 of `@clack/prompts`' 101,684 B. If Node 22 leaves the
supported range, `paint` can go back to `styleText` alone, and the budget comes down with it.
