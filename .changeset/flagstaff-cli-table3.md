---
'flagstaff': minor
---

Add `flagstaff/cli-table3`: cli-table3 0.6.5's API, graded **33 / 33 by cli-table3's own
test suite**.

The full option surface — `head`, `chars`, `style`, `colWidths`, `rowHeights`, `colAligns`,
`rowAligns`, `truncate`, `wordWrap`, `wrapOnWordBoundary`, per-cell `colSpan`, `rowSpan`,
`hAlign`, `vAlign`, `href`, and the `debug` channel with `table.messages` and
`Table.reset()`. It extends `Array`, because cli-table3 does and its callers push rows onto
it.

**One module, not four.** Upstream is `table.js`, `layout-manager.js`, `cell.js` and
`utils.js`, and 201 of its 234 cases test those files directly. Those are reported beside
the number and never gate it — passing them would mean copying cli-table3's file layout
rather than matching its behaviour, which is the one thing a façade owes its users.

**42.3 KB in two packages, against cli-table3 0.6.5's 161.7 KB in seven.** It reaches
`width.js`, already shipped for the other three façades, plus `roundel/chalk` for the two
default styles. It carries its own wrapping rather than sharing `wrap.js`: cli-table3 splits
on `/(\s+)/` and counts with its own `strlen`, which a wrap-ansi port does not reproduce.
