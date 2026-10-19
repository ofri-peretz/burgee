---
id: D-20261019-commander-walk-budget-ratchet
subject: '`./commander`''s walk budget ratchets from 129,400 B to 112,100 B, under commander''s own `lib/` again'
taken: 'Taken — on the owner''s delegation of 2026-10-12 over budgets and trade-offs'
date: '2026-10-19'
superseded_by: —
---

**`./commander`'s budget in `packages/burgee/src/weight.test.ts` moves down, from 129,400 B to
112,100 B.** This closes `commander-compat` X6.

**Why it sat at 129,400.** X6 says the front-end's reachable bytes stay under commander's own
`lib/` (126,365 B), with a budget of 128,000. `facade-gets-more` raised the budget to 129,400 on
2026-09-21. The note there recorded that `scripts/strip-comments.mjs` did not recurse, which
left 14,312 B of doc comments in `dist/commander/`. In that state the entry was over commander's
`lib/`, and the budget was a round number above the reading.

**The measurement, 2026-10-19.** Main at `6b90ffe` was built clean (`rm -rf packages/burgee/dist`,
then `npx turbo run build --filter=burgee`). The walk reads **112,024 B**, the same figure
D-20261018-commander-14-budget took the day before. Two changes account for the drop:
`strip-comments.mjs` now recurses, and `commander-front-end-diet` R1 took `bellpull` off the
static walk. Adding the ~32 B CI reads heavier and rounding up to the next 50 B gives **112,100**.

**Where that leaves X6.** The entry is 14,265 B under commander's `lib/` and 15,900 B under the
spec's 128,000. The ceiling now sits at the reading, so it works as a parity bar again: a change
that spends bytes on this entry must write them down.

**Left alone.** `./commander/extra-typings` (115,400 B, reading 114,072) and
`./commander/v14` (112,750 B, reading 112,711) stay where they are. Neither is X6's row, and v14's
budget was set the day before. extra-typings' 1,328 B of headroom is a candidate for the same
ratchet in its own lane.

**Reversal path.** A change that needs more than 76 B on this entry raises the budget with its
own decision, as D-077 did for 129,400.
