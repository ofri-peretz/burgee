---
"flagstaff": patch
---

`flagstaff/cli-table3` — cli-table3's internal surface now hangs off the default export, and
the informational internals column moves **0 / 104 to 90 / 104** against a control of 103 / 104.

No behaviour changed and the gated row is 29 / 29 before and after. All 104 internal cases
were failing as `X is not a function`: the compat oracle reaches a target's internals through
a CommonJS shim whose body is `module.exports = loaded?.default ?? loaded`, and that unwrap
hands the suite the `Table` class rather than the namespace where `Cell`, `strlen`,
`computeWidths` and fifteen more already lived. `Object.assign(Table, { … })` at the foot of
the module publishes them the way cli-table3's own `src/cell.js` publishes `ColSpanCell` and
`RowSpanCell` — a second spelling of names this subpath already exported, plus six that were
private only because nothing had asked.

Two ceilings are recorded with the measurement in `compat-oracle/src/hosts.ts` rather than
chased: 13 cases in `table-layout-test.js` that resolve `Cell` to `Table` because the shim
collapses four internal modules onto one entry, and the 94 cases of `cell-test.js`, which
never register in the control run either.

`./cli-table3`'s byte ratchet rises 29,000 to 29,300 for the 240 B this costs, with the
reasoning in `weight.test.ts`. It is a ceiling moving in the loosening direction and is the
owner's to reverse.
