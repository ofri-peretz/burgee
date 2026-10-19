# Intent — An agent run that never started is recorded as not run, never as a score

> Stage 1 artifact. Opened from the 2026-10-18 execution audit (batch 1, "CI honesty"). The
> weekly Agent Evals run of 2026-10-15 recorded **0 of 11** for a week in which no agent ran a
> single turn: the Claude subscription had hit its weekly usage limit. The line is on `main`, and
> five intents' eval criteria now read it as a real failing week.

**Status:** approved · **Opened:** 2026-10-18 · **Owner:** @ofri-peretz

---

## What is wanted

When `claude` stops before the model does any work (a usage limit, a refused credential, an
agent that never started), the eval runner and the B1 agent benchmark record that case as
**`not-run`, with the reason**, never as a pass or a fail. Every reader of the series skips a
`not-run` case: no pass rate, no median, no streak counts it, and none is broken by it.

Whether an agent ran is decided by evidence in its own result document: zero tokens and no model
billed. The message text only names the reason.

## Why now

- **The reading on `main`.** `evals/history/2026-10-15-29362dc-38717342918.json` is
  `"model":null`, `tasks: { status: "ran", passed: 0, total: 11 }`. Every case is
  `"status":"fail","turns":1` with input, output, cacheRead and cacheWrite all `0`. It landed
  through #1104 (`chore/evals-history-38717342918`, merged 2026-10-18 19:15 UTC). Issue #1103,
  "Agent evals are failing", has been open since 2026-10-15 10:03 UTC.
- **What happened.** Run 38717342918's log, for each of the 11 cases:
  `agent stopped: success after 1 turn(s) — "You've hit your weekly limit · resets Oct 18, 5am (UTC)"`.
  All 11 finished in 17 s. `runCase` (`scripts/run-evals.ts` line 438) grades whatever text came
  back. The limit message contains none of the expected strings, so each case is `fail`.
  `historyLine` (`scripts/eval-history.ts` line 128) then counts it.
- **The shape `claude` returns.** The B1 run two days earlier hit the same limit window and its
  classifier kept the fields (run 38400890695, 2026-10-13): exit 1, `is_error true`,
  `subtype success`, `api_error_status 429`, `terminal_reason api_error`, the same message.
  Both jobs install `claude` from `.github/tools/claude-code` (2.1.283).
- **Who reads it.** The 2026-10-18 audit (`burgee-roadmap-tracker.md`) lists five criteria that
  now have no current reading: `plugin-contract` C4, `flagstaff` S7, `cli-output-stack` S8,
  `localised-human-surfaces` R7/S4, `locale-pack-in-five` R3. The last one is a turns median
  over `evals/history/` ("median under 6; on main it is 7"). The false line drags that median
  down, because each limit stop records 1 turn. So a week with no measurement would read as
  the best week on record. burgee U9 ("three consecutive recorded runs at 10 of 10",
  D-20261009-burgee-1-0-evidence) is a streak, and the false 0/11 breaks it.
- **B1 is half right.** It already classifies the stop as `rate-limit` (`kindOf`,
  `benchmarks/axes/agent.ts` line 373) and skips the axis when *every* run of a CLI arm fails
  (`nothingCameBack`, line 940). The case it gets wrong is a sweep the limit cuts short. A run
  that printed a result document is `usage: true` (line 510). A 429 stop has one, so it enters
  the tokens and turns medians and totals as 0 tokens. On the MCP arm, a partial cut-off feeds
  zero-token runs into the `burgee-mcp ÷ burgee` ratio that `cli-vs-mcp-tokens` takes its
  verdict from.

## Affected users and systems

- `scripts/run-evals.ts` (`runCase`, the summary, the exit code), `scripts/eval-history.ts`
  (the line format, its validator, a new reader), `.github/workflows/evals.yml` (the issue it
  opens).
- `evals/history/2026-10-15-29362dc-38717342918.json` (corrected).
- `benchmarks/axes/agent.ts` (`runOne`, `sweepAll`, `armRecords`).
- Readers of the series: `locale-pack-in-five` R3, burgee U9, and the four other eval-gated
  criteria above.

## Constraints

- **Evidence, not names.** A case is `not-run` only on evidence from its own result: zero tokens
  in all four counts and an empty `modelUsage`, or no result document and no assistant turn.
  A message, however worded, never decides it alone. Every other case keeps today's verdict.
- **No paid run proves this.** The locks use fixtures cut from the two observed runs and the
  stub `claude` `agent.test.ts` already drives. Nothing here spends a credential.
- **No retry inside a run.** A retry against an exhausted limit spends nothing and learns
  nothing. A later run is the retry.
- **The format change is versioned.** A reader can tell a v2 line from a v1 line, and every
  committed v1 line stays valid.
- **Loud, not green.** A week that measured nothing still fails the job, as B1's "selected and
  produced no measurement" gate does. It fails as *not run*, never as *failing*.

## Success criteria

1. A result document with the observed usage-limit shape becomes a `not-run` case with reason
   `usage-limit` in both the eval runner and B1. Each lock is shown red on `main` first.
2. `evals/history/2026-10-15-29362dc-38717342918.json` reads `not-run` for all 11 cases. A lock
   rejects any committed case that is `fail` or `error` with zero tokens.
3. The history reader returns no measurement for 2026-10-15. A series `[10/10, not-run, 10/10]`
   is two consecutive 10/10 runs, and its turns median ignores the not-run week.
4. A B1 sweep cut short by the limit is not a reading. An MCP arm cut short leaves no ratio.
5. The next scheduled `evals.yml` run with quota left lands a normal v2 line, with no `not-run`
   cases.

## Jev triage

| user_impact | incumbent_gap | risk_reduced | composite | ready_for_spec | needs_model |
| --: | --: | --: | --: | :-- | :-- |
| 0 | 0 | 3 | 9 | yes | no |

## Open questions

- Whether to rewrite the 2026-10-15 line or delete it. **Answered 2026-10-18 in `spec.md`**:
  rewrite it. The run happened and layer 1 measured 4 of 4. Only layer 2's verdict was false.
- Why the subscription was exhausted by Tuesday. **Answered 2026-10-19** by
  D-20261019-b1-weekly-not-per-push: the B1 `agent` job ran on every push to main, about 25 paid
  runs a merge on the same subscription. About 250 landed in the hours after the 2026-10-18
  reset. B1 now runs on the weekly schedule, a manual dispatch or a `bench:agent` PR only.
