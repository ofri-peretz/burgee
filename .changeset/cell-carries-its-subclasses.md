---
'flagstaff': patch
---

`flagstaff/cli-table3`'s `Cell` carries `ColSpanCell` and `RowSpanCell`, the way cli-table3's
own `src/cell.js` publishes them — `module.exports = Cell; module.exports.ColSpanCell = …;
module.exports.RowSpanCell = …`. A caller who reaches `Cell.RowSpanCell` on the incumbent now
reaches it here. Both names were already named exports of the module; this is a second
spelling of the incumbent's shape, and nothing new is published.

With it, cli-table3's internal suite reads **103 / 104** against a control of 103 / 104 — the
target matches the reference exactly, up from 90.
