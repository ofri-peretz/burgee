---
id: D-20261027-dispatched-eval-counts-as-weekly
subject: 'plugin-contract C4, localised-human-surfaces criterion 4 and evals-record-not-run criterion 5 each wait on a "scheduled weekly" evals.yml run that executes. Does an owner-dispatched run of the same workflow count?'
taken: 'Taken by the coordinator on the owner''s instruction of 2026-10-27 ("run them now" to close the eval-gated intents this week)'
date: '2026-10-27'
superseded_by: —
---

**Yes. An `evals.yml` run started by `workflow_dispatch` on `main` is an executed weekly reading
when it runs the same job, records the same v2 line through the same `--record` path, and the
owner asked for it.** Run 40504387711 (2026-10-27, `db19cc6`) is that run: 11 / 11 task cases
passed, config 4 / 4, `notRun: 0`, model `claude-sonnet-5`. Its line is
`evals/history/2026-10-27-db19cc6-40504387711.json`, landed by #1299.

**Why the trigger does not matter to these criteria.** Each criterion asks whether the eval
*executes and passes* — the failure they guard against is a week that never ran (2026-10-15 and
2026-10-22 hit the usage limit) being read as a score. `evals.yml` takes the same steps on
`schedule` and `workflow_dispatch`: the job, the agent, the cases and the `RECORD` flag
(`github.event_name != 'pull_request'`) are identical. The one step that differs is the issue a
*failed scheduled* run opens, which no criterion here reads.

**What it does not change.** The weekly schedule stays (`cron: "20 6 * * 6"`, D-20261027-close-three-workflow-gaps)
and keeps producing the series `eval-history-lock` reads. A dispatched run is not a way to skip a
failing week: a failed or `not-run` reading, scheduled or dispatched, still counts against the
series exactly as before.

**Extended the same day to `control-bands.yml`.** `sdlc-locks-evals-bands` S3 waited on "the
scheduled run" of the band watcher. Run 40537224930 (2026-10-27, `3aaf422`) is that workflow
dispatched on `main` on the same instruction. The job, the `--backfill-git --write-intent --check`
step and the observations PR are the same on `schedule` and `workflow_dispatch`. It landed through
PR #1312 and gave all 55 bands a point, `test-duration-ms` its eighth, with no breach. The weekly
schedule (`10 5 * * 1`) stays.

**Reversal.** If the next scheduled run (2026-10-31 06:20 UTC) executes and fails a case these
intents name, reopen the intent that case belongs to.
