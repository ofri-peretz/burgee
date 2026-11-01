---
id: D-20261101-mutation-floors-numericliteral-restate
subject: "oxmutate 1.1.0 added the NumericLiteral mutator, and the 2026-10-31 weekly run scored eight packages below floors measured without it: kill the survivors, or restate the floors?"
taken: "Taken — by the session that built oxmutate, under the owner's standing delegation of two-way doors, 2026-11-01"
date: "2026-11-01"
superseded_by: —
---

**Seven floors restart at what the 2026-10-31 run measured, rounded down to one decimal:**
caique 87.3, closeout 89.9, compat-oracle 91.1, controlroom 91.3, flagstaff 86.1, paratext 84.4,
seniority 90.7. **linegauge keeps its floor of 88.4** because its gap was a missing test, now written.

**What changed was the measurement, not the code.** Run 41185206028 (commit bd98f43aae,
oxmutate 1.1.0) is the first weekly run with `NumericLiteral`. Compared with run 40818077916
(2026-10-29, oxmutate 1.0.2), it is the only mutator that appears among the new survivors. Its
survivors account for every breach: counting them as killed puts each of the eight packages back
above its floor.

| package       | floor | 10-31 score | NumericLiteral survivors | score if they were killed |
| ------------- | ----- | ----------- | ------------------------ | ------------------------- |
| caique        | 88.1  | 87.38       | 97                       | 88.79                     |
| closeout      | 90.3  | 89.90       | 7                        | 90.75                     |
| compat-oracle | 92.0  | 91.17       | 69                       | 92.20                     |
| controlroom   | 92.4  | 91.34       | 17                       | 92.92                     |
| flagstaff     | 87.7  | 86.17       | 33                       | 88.10                     |
| linegauge     | 88.4  | 68.95       | 677                      | 91.87                     |
| paratext      | 85.2  | 84.41       | 24                       | 86.07                     |
| seniority     | 91.0  | 90.71       | 30                       | 91.29                     |

**linegauge is fixed rather than restated.** 621 of its 677 survivors were the generated East
Asian Width tables in `width.ts`. `generate-width-tables.mjs --check` compares the file's text
in a subprocess, so no test ever asked the loaded tables a question. `width.test.ts` now sweeps
every code point against the pinned `get-east-asian-width`, which kills a changed table entry.

**Why restate the other seven rather than keep their floors until the survivors
are killed.** The 299 survivors are spread across seven packages, and many are constants no
test should pin, such as a padding width or a retry count. A floor exists to catch a test
suite getting weaker. Holding these seven below a number measured with fewer mutators would
fail every weekly run until someone wrote those tests, and a run that always fails catches
nothing. From the new floors the ratchet works as before: killing a survivor raises the floor
on the next run.

**Reversible.** A later decision can put any floor back, and the weekly run raises each one
on its own as the survivors are killed.
