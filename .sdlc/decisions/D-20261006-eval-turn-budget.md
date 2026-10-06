---
id: D-20261006-eval-turn-budget
subject: 'U9''s authoring eval failed 4 of 10 on `error_max_turns` at the cap of 8 (#787); is the cap still measuring the schema'
taken: Taken
date: '2026-10-06'
superseded_by: —
---

**No — the cap is 12 now, and every case line prints the turns it used.** D-143 kept "one
turn" as one user prompt and set the tool loop at 8: four steps, one fix, one re-run, the
answer and one spare. On 2026-10-06 the PR runs of `evals.yml` (e.g. run 37417310468) passed
6 of 10, and all four failures (bellpull, burgee, paratext, seniority) ended
`error_max_turns after 9 turn(s)` with no last words. They hit the cap; no plugin was refused
by `check`. seniority's case had already written its file and was still repairing it when
the loop stopped. That is D-143's own argument against a cap of 3: it measured the cap, not the
schema. D-143's arithmetic assumed exactly the four named steps, and agents also look for the
CLI, list `evals/results/` or re-read the schema after a refusal. 12 adds four spare steps; it
is still a constant (`DEFAULT_MAX_TURNS`, pinned by `run-evals.test.ts`), and `EVAL_MAX_TURNS`
still overrides it.

This is tuning to a result, and it is recorded as that. The check that keeps it honest is the
new turns column: each case line reads `✓ <id> — N turn(s)`, and the weekly history line already
records `turns`. If passing cases routinely use 10–12 turns, the README or the schema is not
self-describing, and that is a finding against them, not a reason to raise the cap again.

U9 stays Not built: the stated rate is 9 of 10 for three consecutive weekly runs, and this
decision does not count a run.
