---
id: D-20261027-close-three-workflow-gaps
subject: 'Three recorded gaps each needed a `.github/` edit, and each such pull request runs the eleven paid task evals once. Build them as one pull request or three, and what budget does the control-band watcher get?'
taken: Taken
date: '2026-10-27'
superseded_by: —
---

**One pull request closes all three, so the task evals run once rather than three times. The control-band job gets 25 minutes, after the watcher stops re-reading the same git history for every band.**

**Why one.** B-20261026-models-yml-holds-code-invariants, B-20261026-evals-run-after-quota-reset and B-20261026-control-bands-demo-build-and-budget were each held back from the batch that found them for one reason: a change under `.github/` matches `evals.yml`'s `pull_request` paths and runs the paid task evals on its pull request. The three edits share no lines, and none changes what the evals measure. Bundled, the spend is one run. The owner's delegate accepted that one run.

**What changes.**

| gap | change | lock, red on `b62bd20c86` |
| :-- | :-- | :-- |
| models-yml-holds-code-invariants | `models.yml` loops over `unsplitHolds npmOnlyHolds holdsVersionsNotCode shippedNeverReleasesAFeature shippedNeverHoldsAFix`; each must stay violated. `safety` already runs for every model | `scripts/release-window.test.ts` › "models.yml keeps the model’s rejected designs failing" reads the loop and requires exactly those five |
| evals-run-after-quota-reset | `evals.yml` cron `20 5 * * 4` → `20 6 * * 6`: Saturday 06:20 UTC, an hour after the reset both not-run lines quoted | `scripts/eval-history-lock.test.ts` › "runs after the weekly quota resets, not days into the spent week" |
| control-bands-demo-build-and-budget | build `--filter=demo-cli-burgee` beside `./packages/*`; read each suite's git history once; `timeout-minutes: 25` | `scripts/root-suite-build-scope-lock.test.ts` (now counts `npm test` and the band watcher as running the root suite), `scripts/control-bands-workflow-lock.test.ts` |

**The budget number, and why not just raise the limit.** Run 40311991676 (2026-10-26) spent its whole 20 minutes in "Record observations and evaluate bands". The log shows why: `collectFromGit` ran per band, and every `cli-benchmarks` band (50: nine configured, forty-one derived compat hosts) re-walked the same history, about 23 s a walk, 44 walks before the cancel. The 2026-10-19 run did the same at about 14 s a walk. That cost grows with hosts × history, so a larger limit would only move the date of the next cancellation. Reading each suite once makes it two walks per run (`cli-benchmarks`, `agent-cli-bench`), about 40 s on the runner by the same log. Reading the same suite again in one process costs nothing (measured locally: 0 ms on the second read).

What remains is `npm test`, which the watcher caps at `COMMAND_TIMEOUT_MS`, 15 minutes. Its last recorded durations were 189 s and 194 s (2026-09-27/28), but the two runs since stopped at the first red root suite, so its current length is not known. The limit is the cap plus `WATCH_MINUTES_BEYOND_TEST` = 10 (setup 20 s, a cold build of the packages and the demo, two git walks, evaluation, the PR), so a slow but passing suite still lands its points. **25 minutes.** `control-bands-workflow-lock.test.ts` fails if the limit drops below the cap plus that margin, so raising the cap without the limit fails on the pull request, not in an unwatched Monday run.

**Rejected.**

- *Three pull requests, one per gap.* Three task-eval runs for edits that do not touch what the evals measure.
- *Raise the limit to 40 and leave the per-band walk* (the gap's first option). It grows with every compat host added, and a host lands most weeks.
- *Stop `--backfill-git`.* It recovers pruned benchmark runs the working tree no longer has. Reading it once keeps that and drops the cost.
- *Thursday evals with a quota guard.* The quota is the subscription's, not the repository's. Moving the run to the hour after the reset is the only change that gets a full week's quota.

**What stays open.** Each gap is closed; the intents' criteria wait on scheduled runs. `evals-record-not-run` criterion 5 (and the `flagstaff` C7 and `plugin-contract` C4 readings) waits on the Saturday 2026-10-31 06:20 UTC run. `sdlc-locks-evals-bands` S3 waits on the Monday 2026-11-02 05:10 UTC control-band run and its observations pull request merging. A breach draft that is closed loses that week's points, as #1154 did (gap point 3); this decision does not change that. The reset time came from two messages and may move. If a Saturday run reads `not-run`, the schedule is the first thing to re-check.
