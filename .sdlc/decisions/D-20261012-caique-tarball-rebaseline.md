---
id: D-20261012-caique-tarball-rebaseline
subject: '`check-published-artifacts` refuses #1037 at +13.3% over caique''s 2026-10-11 tarball figure: is the growth re-recorded, or trimmed first?'
taken: 'Taken — on the owner''s delegation of 2026-10-12, "You''re managing the baselines and you need to use your judgement to decide if something is reasonable"'
date: '2026-10-12'
superseded_by: —
---

**Re-recorded at what npm serves for caique 1.2.0: 68,179 -> 72,539 B gzipped and 232,356 ->
246,099 B unpacked (+6.4%, +5.9%), 59 files. No other package's figure moves, and the 10%
allowance in `scripts/check-published-artifacts.ts` now runs from there.** This is a band
moving in the loosening direction, which `DECISIONS.md` sends to the owner; the owner
delegated baselines in writing on 2026-10-12, and this is that delegation used, as
D-20261012-burgee-tarball-rebaseline used it for burgee the same day.

**Value gained.** The growth is shipped product, not drift. Between the 2026-10-11 figure and
1.2.0, caique gained prompt chrome that speaks the runtime's locale (#1045) and `--quiet`
reaching `caique/clack`'s decoration (#1060). The clack cancel-during-validation fix (#1068)
merged after the 1.2.0 release commit (#1065), so it is not in the published figure; main's
build with it packs at 72,560 / 246,175, 21 B gzipped over 1.2.0. #1037 (inquirer `select` and
`checkbox`, the inquirer-prompts-drop-in intent) trips the check at 77,278 B gzipped, +13.3%
against the old figure, only because the figure was never moved for what had already shipped.
Against 1.2.0 it is +6.5%, inside the allowance, so #1037's own growth is judged by the check
as it stands rather than by this change.

**Bytes paid.** +4,360 B gzipped and +13,743 B unpacked against the 2026-10-11 figure, measured
with `npm pack caique@1.2.0 --dry-run --json` on 2026-10-12. The check compares a build of the
tree, so the figure is the published pack rather than any one branch's build.

**What the incumbents install for the same surface.** Measured on 2026-10-12 by resolving each
package's tree with `npm install --package-lock-only` and summing `npm pack --dry-run --json`
over every package in it:

| install                   | packages | gzipped   | unpacked  |
| ------------------------- | -------- | --------- | --------- |
| `@inquirer/prompts@8.7.3` | 25       | 351,286 B | 968,790 B |
| `@clack/prompts@1.8.1`    | 6        | 50,575 B  | 182,472 B |
| `caique@1.2.0`            | 5        | 223,837 B | 717,113 B |

caique's own tarball (72,539 B) is larger than clack's whole install and a fifth of
inquirer's. The rest of its install is roundel, closeout, linegauge and paratext, family
packages: burgee 1.3.0 already depends on all but paratext, so a burgee program adding caique
downloads its tarball and paratext 1.0.6's (37,144 B), 109,683 B gzipped in all. That one tarball carries
both surfaces: `caique/clack` for `@clack/prompts`, and the inquirer prompts #1037 extends,
where the incumbents are two installs. The per-entry budgets in
`packages/caique/src/weight.test.ts` are what hold a program's runtime cost, and none of them
moves here: the tarball is what an install downloads once, not what a run loads.

**Reversal.** Lower the `caique` row of `.sdlc/bands/artifact-size-baseline.json` to the next
measured pack and add a dated paragraph to its `$comment`. Lowering needs no permission. If
the owner judges this raise wrong, the figure goes back to 68,179 / 232,356, and #1037 waits on
a trim that brings its pack to 74,996 B gzipped or less, 10% over that figure: 2,282 B off its
77,278.
