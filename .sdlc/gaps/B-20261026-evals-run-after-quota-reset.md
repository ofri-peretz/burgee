---
id: B-20261026-evals-run-after-quota-reset
section: B
status: closed
source: evals-record-not-run criterion 5 (a scheduled run with quota left lands a normal v2 line)
recommendation: 'Move `evals.yml`''s cron from `20 5 * * 4` (Thursday) to `20 6 * * 6` (Saturday, an hour after the weekly reset), in a pull request whose task-eval run the owner accepts, and pin the day in `scripts/eval-history-lock.test.ts` › "evals.yml records the weekly run and lands it"'
---

The weekly agent evals run on Thursday, five days into the Claude subscription's quota week, and
the last two found the quota already spent. Both runs quote the reset time: run 38717342918
(2026-10-15) "resets Oct 18, 5am (UTC)" and run 39762001842 (2026-10-22) "resets Oct 25, 5am
(UTC)". Both are Saturdays at 05:00 UTC. The two weeks recorded `not-run` lines, as
evals-record-not-run now requires, so the series is honest; it is also empty, and five intents'
eval-gated criteria wait on a reading.

A run an hour after the reset meets the freshest quota of the week. It costs nothing extra: the
same eleven cases, once a week, on a different day.

It is a decision, not a build, for two reasons. The reset time is the subscription's, read from
two messages, and may move. And the change sits under `.github/`, which `evals.yml`'s own
`pull_request` paths include, so its pull request runs the eleven paid task evals once.

**Closed 2026-10-27** by [D-20261027-close-three-workflow-gaps](../decisions/D-20261027-close-three-workflow-gaps.md), the recommendation as written. `evals.yml` runs at `20 6 * * 6`,
Saturdays 06:20 UTC, an hour after the quota resets. `scripts/eval-history-lock.test.ts` ›
"runs after the weekly quota resets, not days into the spent week" requires day 6 and a time in
the two hours after 05:00 UTC: red on `b62bd20c86` (day 4). The schedule's other statements (the
`flagstaff`, `plugin-contract`, `evals-record-not-run` and `burgee` intents, the intents README,
the roadmap, `citation-probe.yml`'s comment) name Saturday 2026-10-31. `evals-record-not-run`
criterion 5 closes on the first such run that lands a `ran` line.
