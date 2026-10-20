---
id: D-20261020-node-26-waits-for-lts
subject: 'Which Node majors `compat.yml` grades: the active LTS lines only, so Node 26 waits for its LTS promotion'
taken: Taken
date: '2026-10-20'
superseded_by: —
---

**`compat.yml`'s `matrix` job runs Node 24 only. Node 26 rejoins, as `node: [24, 26]`, on the
day it is promoted to Active LTS, and not before. The `floor` job (20.19.0, 22.13.0) is
unchanged.**

**Why.** The owner's rule (2026-10-20): a Node major is not checked until it is the stable,
main line. C3's own requirement already says the same thing: *"every Node LTS inside its
`engines` range"* (`compat-oracle/spec.md`). Grading 26 while it was still Current was the
exception, added on 2026-09-23 so that 26 would not be graded for the first time as an LTS.
A Current line still moves under the suite: npm 11.16, which ships with 26, refuses lock
shapes that 24's npm accepts (#1088), and the Windows 26 cell had timing failures (see
`windows-lane-holds`). That made red cells on PRs whose change had nothing to do with Node.

**What it costs.** The window in which a 26-only break could reach users unseen is the time
until promotion. `engines` still admits `>=22.13.0`, so 26 is claimed but not graded until
then. The cost is small: the whole suite passed on v26.10.0 when 26 was restored on
2026-09-23, and 26 has been graded on every PR since.

**Revisit.** On 26's Active LTS promotion: put back `node: [24, 26]`, the dispatch option
`'26'`, the `if:` clause and the `exclude:` expression, and restate C3 in both specs.
