---
id: D-20261026-linegauge-r4-r13-restated
subject: 'linegauge: two requirements in `spec.md` say the opposite of what shipped (R4 rounds a slice outward, R13 hosts no plugin key). Which is right, the text or the package?'
taken: 'Taken by the coordinator under the owner''s delegation (burgee-owner-delegates-tradeoffs), 2026-10-26, in the umbrella sweep'
date: '2026-10-26'
superseded_by: —
---

**The package is right in both cases. Both requirements are restated to what `linegauge@1.1.5`
publishes, and the old wording stays in `spec.md`, struck through.** Neither restatement makes a
success criterion easier to meet. Both requirements sit under criterion 1 (the four suites graded)
and both were changed because an incumbent's own suite or a reported terminal needed it.

**R4. A slice that lands inside a wide cluster rounds inward, not outward.** The 2026-09-09 text
says "rounds outward, never inward". slice-ansi 9.x rounds inward, and its suite grades it. #655
(2026-09-27) followed it and took `slice-ansi` from 15 / 15 on 7.x to 104 / 104 on 9.0.1. The old
behaviour was also a defect one layer up: `truncate` is a slice plus an ellipsis, and rounding
outward returned `あい…`, five columns, for a budget of four. The source comment at
`packages/linegauge/src/slice.ts` records this. The check is `packages/linegauge/src/slice.test.ts`
› "rounds inward at a wide character, never outward". The grade is
`packages/compat-oracle/baseline/slice-ansi.json` (104 / 104).

**R13. linegauge hosts one plugin key, `widths`, and it is data.** The text says "no plugin key,
by design". `packages/linegauge/src/plugin.ts` hosts `widths: { [name]: { ranges, columns, why } }`.
It exists for the cases R13's own argument could not reach: a Nerd Font's double-width Private Use
glyph, a code point newer than the compiled Unicode table, and box drawing a font draws wide. Each
is a local disagreement between one terminal and the table. The answer stays one value per code
point, and a caller who supplies it writes down why (`why` is required, which no other `$def` in
the family requires). Unknown keys are ignored, as in every host. The checks are
`packages/linegauge/src/plugin.test.ts` › "a plugin contributes width overrides" and
`scripts/plugin-contract-lock.test.ts` › "linegauge hosts `widths`, and its README no longer says it
hosts nothing". The published tarball carries it (`linegauge@1.1.5` `dist/plugin.js`, read
2026-10-26). R13's real concern was that a registered answer would land under a pass rate no grader
produced. That still holds: with no plugin registered the graded functions answer exactly what
they did ("costs nothing when no plugin registers, including on the ASCII path").

**What this does not change.** R9's spawn-delta clause is a separate question, and
[D-20261026-library-spawn-delta-rows](./D-20261026-library-spawn-delta-rows.md) answers it. It
reopens that clause, so linegauge stays `approved`.
