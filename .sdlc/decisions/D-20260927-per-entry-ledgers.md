---
id: D-20260927-per-entry-ledgers
subject: Where a decision or a gap is recorded, and how a new one is numbered
taken: Taken — on the owner's instruction to stop parallel PRs conflicting on the ledgers
date: '2026-09-27'
superseded_by: —
---

**One file per entry — `.sdlc/decisions/<id>.md` and `.sdlc/gaps/<id>.md` — and new ids are `D-YYYYMMDD-slug` (`A-`, `B-`, `C-` for gaps), never the next number.** Over the ~120 PRs before this, `.sdlc/DECISIONS.md` was touched by 36 and `.sdlc/GAPS.md` by 32; each appended a row with the next sequential id, so any two in flight together conflicted and one rebased, renumbered and re-ran ~20 minutes of CI (feature PRs #472–#484 took 18–26 h with up to four merge-from-main commits). A new file with a name nobody else picks is the shape `.changeset/*.md` already has and it never conflicts. D-001..D-151, A1..A30, B1..B22 and C1..C7 keep their names verbatim (D-151 was cited by #631 on main without its row, and is recorded from #631's own text), because commits, specs, READMEs and six workflows cite them; the sequence is frozen, because "max + 1" is exactly what two agents compute identically — the old ledger already held two C5s. A date plus a slug collides only on the same slug the same day, and then as a git add/add conflict rather than a silent merge. **No generated table is committed**: an index every decision PR regenerates is one file every decision PR edits at the same place, which moves the conflict instead of removing it; `npm run ledger` prints the tables on demand. The two `.md` files keep their prose and hold no rows, and a row written back into either fails `decisions-lock.test.ts` or `gaps-lock.test.ts`, so an agent following the old instructions goes red instead of appending to a file nothing reads
