# Intent — B1 over MCP: the same program, the same tasks, served both ways

> Stage 1 artifact. Opened from the next-wave ranking
> ([`next-wave-2026-10.md`](../../research/next-wave-2026-10.md)). It closes a `cli-mcp`
> success criterion unmet since 2026-09-06, and produces the number
> `migration-drivers.md` calls the highest-value one this repository can make.

**Status:** shipped · **Opened:** 2026-10-12 · **Owner:** @ofri-peretz

> **Shipped 2026-10-27: four of four readings**, runs 40492593210 (weekly), 40518014447, 40528288811 and 40539828491 (owner-dispatched). R5 is on
> `what-an-agent-sees.mdx` under `agent-page-lock`. See [`spec.md` § Shipped 2026-10-27](./spec.md#shipped-2026-10-27).
>
> *Before that:* **1 of the four readings on 2026-10-27** (run 40492593210: tokens 1.108, turns 1.081, 15 of 15 MCP
> runs connected and passed). The first paid run of the arm, 2026-10-20, never reached its MCP
> server, so it is no reading. The harness now refuses that before it spends a run
> ([`spec.md`](./spec.md) R6,
> [`D-20261026-b1-mcp-arm-server-guard`](../../decisions/D-20261026-b1-mcp-arm-server-guard.md)).
> Since 2026-10-27 a reading may come from an owner-dispatched run as well as the schedule
> ([`D-20261027-b1-mcp-arm-owner-dispatch`](../../decisions/D-20261027-b1-mcp-arm-owner-dispatch.md)).
> What closes this intent is in [`spec.md` § What closes this intent](./spec.md#what-closes-this-intent).

---

## What is wanted

The B1 agent benchmark gains a third variant: the burgee demo served over `--mcp`, driven by the
same agent, on the same five tasks, with the same checks. Tokens and turns per completed task are
published for the CLI and the MCP server built from **one declaration**, with the median and the
range over every run, whichever way the number falls.

The question it answers is the one the agent community argues about without a controlled
measurement: for the same capability, is a well-described CLI cheaper for an agent than an MCP
server? burgee is the one framework that can hold everything else constant, because both
surfaces are projections of the same manifest.

## Why now

- **`migration-drivers.md` §7**, written 2026-09-20: *"agent tokens per completed task, for the
  same capability offered as a burgee CLI and as an MCP server … That is the single
  highest-value unbuilt thing in the repository. It is a first-party number on a live industry
  argument."*
- **`cli-mcp`'s fourth success criterion, unmet since 2026-09-06**: *"B1 reports the same task set
  over MCP and over Bash — not met. No benchmark exists."* (`.sdlc/intents/cli-mcp/intent.md`).
- **The circulating numbers do not survive checking.** `agent-requirements.md` §1 traced
  "32× cheaper, 100% vs 72%" to one vendor post contradicted by its own repository. The one
  credible replication (AWS, n = 10 per task, five tasks) found 43–60% fewer input tokens for the
  CLI at equal success. A same-declaration comparison is a stronger control than either.
- **B1 now runs.** It lands a reading on every push to `main`
  (`benchmarks/results/agent-cli-bench/`), with per-task transcripts (`b1-transcripts`). The
  harness, the credential and the isolation flags exist, so the arm is a variant, not a new
  benchmark.

## Affected users and systems

- `benchmarks/axes/agent.ts` (`VARIANTS`, the spawn arguments), `benchmarks/tasks/*.json`,
  `benchmarks/claims.ts` and the bands, `.github/workflows/bench.yml`.
- `apps/docs/content/docs/what-an-agent-sees.mdx`, which publishes the result, and
  `scripts/agent-page-lock.test.ts`, which holds every number on it.
- **Paid agent runs.** B1 is 5 tasks × 5 runs × 2 variants = 50 runs a reading, and
  `bench.yml` calls it "an hour of paid agent runs". The arm adds 25 runs (+50%) to each reading
  it joins. See Constraints.
- **Depends on** [`mcp-current`](../mcp-current/intent.md): the arm measures the server users
  will get, with `structuredContent`, not today's text-only one.

## Constraints

- **The cost is quoted and bounded before anything runs.** The MCP arm runs on the weekly
  schedule (`cron: "40 5 * * 2"`) and on the `bench:agent` label, **not** on every push to
  `main`: +25 runs a week, not +25 runs a merge. Raising that frequency is a decision with the
  number beside it. One was taken on 2026-10-27: the owner may dispatch a reading with the
  `mcp-arm` input, and approved three
  ([D-20261027-b1-mcp-arm-owner-dispatch](../../decisions/D-20261027-b1-mcp-arm-owner-dispatch.md)).
- **One variable.** Same demo build, same model, same pinned `claude`, same tasks, same checks,
  same turn limits, same isolation (`--setting-sources project,local --strict-mcp-config`). The
  only difference is the allowed tool: `Bash(demo:*)` or the demo's MCP tools.
- **Never conclude from one run.** B1's run-to-run swing is large: the pooled token medians
  read 0.491 to 0.995 across consecutive readings while the totals read 0.549 to 0.699
  (D-20261009-b1-totals-and-explain). The published claim is the median with its range, over at
  least four readings from scheduled or owner-dispatched runs, before any verdict sentence is
  written.
- **Published whichever way it falls.** If the MCP arm is cheaper, the page says so. The family
  ships both surfaces, and the positioning (`agent-requirements.md` §7) is "and MCP, from the
  same source", not "instead of MCP".
- **A task that does not map to a tool is excluded by name, not adapted.** `non-tty-required`
  tests a terminal behaviour MCP does not have. If a task cannot be stated identically to both
  arms, it is excluded from the arm's totals and the page says which and why.

## Success criteria

1. `npm run bench -- --axis agent` runs the arm beside the two existing variants when a credential
   is present, and skips loudly without one, as B1 does today.
2. Four readings on `main` from scheduled or owner-dispatched runs carry the arm, reported as their
   median and range (restated 2026-10-27 from "four weekly readings",
   D-20261027-b1-mcp-arm-owner-dispatch). The page publishes, per mapped task and pooled,
   the median tokens and turns for `burgee` (CLI) and `burgee-mcp`, with the range. Every number
   is held by `agent-page-lock`.
3. `cli-mcp`'s criterion "B1 reports the same task set over MCP and over Bash" is marked met,
   with the run ids.
4. A claim, `cli-vs-mcp-tokens`, exists in `benchmarks/claims.ts` with its verdict computed, never
   typed.

## Open questions

- Which tasks map. **Answered 2026-10-12 in `spec.md`**: each task file declares `modalities`,
  and R1 sets it from what the task asks, before any run.
