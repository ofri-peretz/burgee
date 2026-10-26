---
id: D-20261025-batch29-locks-tests-rulings
subject: 'Batch 29 (the locks and tests six accepted intents name): how the B7 link rule reads a table, which intents can be stamped shipped, and what the first absorption-probe readings mean'
taken: 'Taken by the coordinator under the owner''s delegation (burgee-owner-delegates-tradeoffs), 2026-10-25'
date: '2026-10-25'
superseded_by: —
---

**Batch 29 builds the tests, locks and docs that six designs accepted on 2026-10-25 name.** Those
designs are `sdlc-locks-evals-bands`, `caller-matrix`, `cli-foundation-stack`, `commander-env`,
`dev-loop` and `cli-benchmarks`. This file records five calls the build had to make.

**1. B7 reads a table with the paragraph that introduces it.** The design says each benchmark
figure "sits in a paragraph or table row that links to `/docs/benchmarks`". The README's claim
table has ten rows. A link in every row would repeat one URL ten times without telling a reader
anything new. So `scripts/benchmark-links-lock.test.ts` counts a table row as linked when the row
links, or when the paragraph directly above the table links. A table never borrows a link from
further up the page. A figure is a ratio (`0.974×`, `1.47x`), a byte count (`24,484 bytes`,
`10,452 B`, `3.3 KB`), or a cold-start delta (`+19.1 ms`). The first run found unlinked
figures in the root README, `comparison.mdx` and eight of the package READMEs. Each one now links.
The generated weight sentence in every package README carries its own link
(`scripts/readme-benchmarks.ts`).

**2. Package README edits ship through patch changesets, so two intents wait for the Version
PR.** npm shows the README of the latest published tarball. The Y4 builtin sentence, the Y12
opening and the B7 links are therefore public only once each package publishes again.
`linegauge`, `seniority`, `bellpull` and `closeout` (Y4/Y12/B7), and `caique`, `flagstaff`,
`paratext` and `roundel` (B7), each get a patch changeset. `burgee` gets a minor for
`commander-env` V2 and K3. Until the Version PR merges and publishes, `cli-foundation-stack`,
`cli-benchmarks` and `commander-env` stay `approved` with a Status table. That follows the
program's rule: shipped means merged and nothing left to publish.

**3. Two intents stay open on a criterion this batch was not asked to close.**
- `caller-matrix` S1 says "every cell green or n/a-with-reason". The registry has 43 held, 7 n/a
  and **5 missing** cells: errors × accessible, and prompts, spinner, table and box × program.
  The design puts tests for missing cells out of scope, so the lock pins the ceiling at 5 and the
  ceiling may only fall.
- `sdlc-locks-evals-bands` S3 says every band gains a point per scheduled run. The batch makes
  the starved duration band say why it dropped a point: the exit code, the timeout, or the
  signal, plus the last fifteen lines the command printed. The band still records nothing until
  that cause is fixed. The run of 2026-10-19 shows `npm test` ending after about 69 s, so the
  cause is a failing run, not the 900,000 ms ceiling. The next weekly run names the test.

**4. The agent-cost window is 2026-10-10 to 2026-10-18, and it holds 52 readings, not 50.** A
reading is a `<date>-<sha>-ci.json` file measured on a CI runner that carries the ratio. The
window is set by the dates in the file names, inclusive. Over that window the token ratio has
median 0.502 (range 0.434–0.627), at or under 0.6 in 51 of 52. The turn ratio has median 0.522
(range 0.446–0.634), at or under 0.7 in all 52. The design gate counted 50 readings with a
median of 0.504, by a selection it did not record. The generator's count is the one that can be
recomputed, and `claim-table-lock` recomputes it.

**5. The first absorption-probe readings open no intent yet.** The baseline was taken on darwin
from the built `dist`. Each row reads builtin passes / vectors.

| Node | strip | width | dotenv | cross-spawn | exactly once |
| :-- | --: | --: | --: | --: | --: |
| 20.19.0 | 8 / 11 | 3 / 9 | 7 / 10 | 3 / 3 | 4 / 7 |
| 22.13.0 | 8 / 11 | 3 / 9 | 7 / 10 | 3 / 3 | 4 / 7 |
| 24.12.0 | 8 / 11 | 3 / 9 | 9 / 10 | 3 / 3 | 4 / 7 |
| 26.10.0 | **11 / 11** | 3 / 9 | 9 / 10 | 3 / 3 | 4 / 7 |

Node 26 strips the colon form of an SGR parameter (`ESC[38:2::255:0:0m`), which is the reason
`linegauge/strip` scans instead of calling the builtin. So on Node 26 the builtin passes every
strip vector. `util.parseEnv` gains two vectors from 22 to 24. Both rises are above the floor:
`engines.node` is `^20.19.0 || >=22.13.0`, and the floor job runs 20.19.0 and 22.13.0, where
both counts stand at their baseline. A layer cannot be deprecated while its floor needs it. The
trigger is therefore the floor moving to 26: that change must open the intent to deprecate
`linegauge/strip` on purpose. `cross-spawn` reads 3 / 3 on POSIX only, because `npm` is a `.cmd`
shim on Windows. The Windows floor cell is what tests that vector.
