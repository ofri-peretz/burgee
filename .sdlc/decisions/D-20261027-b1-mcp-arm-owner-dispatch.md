---
id: D-20261027-b1-mcp-arm-owner-dispatch
subject: 'b1-mcp-arm: may the readings that close the intent come from runs the owner dispatches, and not only from the weekly schedule?'
taken: 'Accepted — the owner''s spend, approved 2026-10-27: "Dispatch 3 extra B1 agent-cost runs (~1.9M tokens each for the MCP arm, ~6M total) to reach b1-mcp-arm''s 4 readings."'
date: '2026-10-27'
superseded_by: —
---

**Yes. A reading may come from the weekly schedule or from a manual dispatch of `bench.yml` with its
`mcp-arm` input set. The closing criterion is restated from "four weekly readings" to "four
readings from scheduled or owner-dispatched runs, reported as their median and range". Nothing else
about a reading changes.** This is money, which `DECISIONS.md` sends to the owner. The owner
approved the spend on 2026-10-27, and this file records the bound.

**Why the bound moved.** [D-20261012-b1-mcp-arm-approved](./D-20261012-b1-mcp-arm-approved.md)
bounded the arm to the weekly schedule and a `bench:agent` PR, so four readings took four weeks.
The first counted reading landed on 2026-10-27 (Benchmarks run 40492593210,
`2026-10-27-4c336da-weekly-ci.json`, PR #1292). The ratio was 1.108 for tokens and 1.081 for turns,
and all 15 MCP runs connected and passed. The schedule was a spending bound, not a measurement
requirement. The owner has now approved the spend that reaches four readings this week.

**What still makes a reading.** Unchanged, per
[D-20261026-b1-mcp-arm-server-guard](./D-20261026-b1-mcp-arm-server-guard.md):

- every MCP run's `init` event reported the server `connected`;
- at least 0.8 of the arm's runs passed their own check;
- only then does the file carry a `burgee-mcp ÷ burgee` `mcp-tokens-total-ratio` record;
- a file without that record counts toward nothing, however it was dispatched.

**The noise rule stays the verdict rule.** One B1 run has swung the pooled token median from 0.491
to 0.995 between consecutive readings (D-20261009-b1-totals-and-explain). Back-to-back dispatches
run on the same day and probably the same commit. That is less spread than four weeks would give,
not more, so the page reports the median **and** the range of the four, never one reading.
`cli-vs-mcp-tokens` still takes the midpoint median of the readings (`armRecords`), never a
typed number.

**The bound, in the workflow** (`.github/workflows/bench.yml`, held by `benchmarks/ci-axes.test.ts`
R4 and `scripts/b1-lands-lock.test.ts`):

- `BENCH_AGENT_MCP` is `1` on the schedule, on a `bench:agent` PR, and on a `workflow_dispatch`
  whose boolean `mcp-arm` input is `true`. The input defaults to `false`, so a bare dispatch runs the
  two CLI arms only, as before. A push to `main` never runs the arm.
- All of it still waits on the repository variable `B1_MCP_ARM=approved`.
- A dispatched reading lands as `<date>-<sha>-dispatch-<run id>-ci.json`, through the same
  `chore/b1-series` PR as the weekly one. The run id is in the name for two reasons. Three
  dispatches of one commit on one day would otherwise share a file. And the page cites each
  reading by run id. `priorReadings` (`benchmarks/axes/agent.ts`) counts the name exactly as it
  counts `-weekly-ci.json`.

**Spend.** Three dispatches, each the full B1 job: 50 CLI-arm runs and 15 MCP-arm runs. On
reading 1 the MCP arm spent 1,466,064 tokens over 15 runs. The CLI arms spent 5,098,333 (burgee
1,873,004, commander 3,225,329). The owner's quote, about 1.9M tokens a reading for the arm and
about 6M in all, is the bound. Dispatches run one at a time. If a run's agent job reports the
weekly usage limit, no further dispatch is made.

**Rejected.**

- **Waiting three more weeks.** It was the only path without the spend. The owner chose the spend.
- **Counting a dispatch that did not run the arm.** It carries no ratio, so it cannot count, and
  the landing step does not land one.
- **Naming dispatched readings `-weekly-ci.json`.** The name would claim a schedule that never ran
  the reading.

**Reversal.** Remove the `mcp-arm` input and its term in `BENCH_AGENT_MCP`, and restore R4's lock
to refuse a dispatch. Readings already landed stay landed. Whether they count would need a new
decision.
