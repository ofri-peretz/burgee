---
id: D-20261019-burgee-tarball-preflight
subject: '`check-published-artifacts` refuses burgee at +10.6% over its 2026-10-12 tarball figure on #1168 (migrate-preflight): is the growth re-recorded, or trimmed first?'
taken: 'Taken — on the owner''s delegation of baselines of 2026-10-12 (burgee-owner-delegates-tradeoffs)'
date: '2026-10-19'
superseded_by: —
---

**Re-recorded at what npm serves for burgee 1.6.5, rounded up to the next 50 B: 246,526 ->
267,600 B gzipped and 938,302 -> 1,016,900 B unpacked. No other package's figure moves, and the
10% allowance in `scripts/check-published-artifacts.ts` now runs from there.** This loosens a
band, which `DECISIONS.md` sends to the owner; the owner delegated baselines on 2026-10-12, and
this uses that delegation, as
[`D-20261012-burgee-tarball-rebaseline`](./D-20261012-burgee-tarball-rebaseline.md) did.

**Why it tripped here.** The figure had not moved since burgee 1.3.0. Measured with
`npm pack --dry-run --json` on 2026-10-19:

| Tree | Gzipped | Unpacked | Against the old figure |
| :-- | --: | --: | :-- |
| the old figure (burgee 1.3.0) | 246,526 | 938,302 | — |
| burgee 1.6.5 as published | 267,573 | 1,016,862 | +8.5% / +8.4% |
| `main` at `51fec1ba` (adds #1165, `burgee/yargs/v17`) | 270,132 | 1,024,705 | +9.6% / +9.2%, which passes |
| #1168 merged onto `51fec1ba` | 272,644 | 1,032,556 | +10.6% / +10.0%, which fails |

CI measured the merge ref at 272,703 / 1,032,570, within 60 B of the local build. #1168's own
growth is **+2,512 B gzipped and +7,851 B unpacked**. A file-by-file diff of the pack against
`main` changes two entries: `dist/migrate-preflight.js` is new (6,030 B), and `dist/migrate.js`
grows by 1,821 B. No map, data table, stray file or duplicate bundle was packed. The other
~24 KB gzipped of the gap to the old figure had already shipped:

- 1.3.0 → 1.6.5: commander 14's `burgee/commander/v14`, `burgee init`, the yargs conflict and
  implies projections, migrate's release-age pins, and the node10 `typesVersions`;
- since 1.6.5: yargs 17's entry (#1165).

The figure follows the 2026-10-12 precedent and records the published pack, not a branch's
build. #1165 and #1168 therefore count against the new allowance (+1.9% gzipped, +1.5%
unpacked), and are not folded into the figure.

[`D-20261008-install-bytes`](./D-20261008-install-bytes.md) keeps install bytes growing on
purpose, and reopens only if a measured adopter declines. This move is inside that decision: it
re-records growth that shipped, plus 2.5 KB for a check the field trial asked for.

**Trimmed first?** Not available at this size. The over-run was 1,466 B gzipped against the
271,179 B ceiling, and
`migrate-preflight.js` is about 2 KB gzipped with its comments already stripped
(`strip-comments.mjs`). What remains is the row messages and the range reader the spec
requires. The larger trim named in the 2026-10-12 decision still stands as the follow-up: ship
`.d.ts` without doc comments, about −18.8% gzipped, at the cost of editor hover text.

**What the incumbent pays.** Unchanged from 2026-10-12. commander 15.0.0 packs at 52,736 B
gzipped, and yargs 18.0.0 at 47,876 B before its six dependencies. The tarball is downloaded
once at install, and none of the entry budgets in `weight.test.ts`, which hold what a run loads,
moves here.

**Reversal.** Lower the `burgee` row of `.sdlc/bands/artifact-size-baseline.json` to the next
measured pack. Lowering needs no permission.
