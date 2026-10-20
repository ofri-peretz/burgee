---
id: D-20261019-b1-weekly-not-per-push
subject: 'B1 agent cost: does the paid `agent` job in `bench.yml` keep running on every push to `main`?'
taken: 'Taken — on the owner''s instruction of 2026-10-18 (fewer paid runs, `bench.yml` disabled until this lands) and the owner''s delegation of 2026-10-12 over spend'
date: '2026-10-19'
superseded_by: —
---

**No. B1 runs on the weekly schedule, on a manual dispatch, and on a pull request labelled
`bench:agent`, and nowhere else.** The `agent` job's `if:` in `.github/workflows/bench.yml` used to
be `github.event_name != 'pull_request' || contains(…, 'bench:agent')`, which admitted every push
to `main`.

**Why.** One B1 reading is about 25 paid agent runs. They draw on the same Claude weekly quota as
the required `review` check. With a reading on every merge, the quota ran out, and the repository
could not merge for five days, because `review` could not run. About 250 runs landed after the
2026-10-18 05:00 reset. The quota also took two readings that matter:

- the 2026-10-13 weekly B1 reading, which left no observation;
- the 2026-10-15 weekly evals, recorded as 0 / 11 with `model: null`
  (`evals/history/2026-10-15-29362dc-38717342918.json`). That run never executed.

**The spend bound now.** One weekly reading of about 25 runs, plus a reading for each PR that
carries the `bench:agent` label, plus any manual dispatch. The MCP arm's own bound (b1-mcp-arm R4,
schedule and labelled PRs only) is unchanged and still nests inside the job's.

**What it costs.** The agent bands (`agent-tokens-per-task`, `agent-turns-per-task` and the
reliability series) get one point a week instead of one per merge, so a band takes weeks to
re-centre after a step. That trade is deliberate. A per-merge series that freezes `main` measures
nothing for five days.

**What holds it.** `benchmarks/ci-axes.test.ts` › *B1 runs weekly and on request, never per push*.
It evaluates the job's `if:` for each event, and its last case evaluates the old condition to show
that a push ran there.

**How to reverse.** If the quota is separated from the `review` check, for example by a separate
credential or a metered `ANTHROPIC_API_KEY` with its own budget, a per-push reading can come back.
Restore `github.event_name == 'push'` in the job's `if:`, invert the push cases in `ci-axes.test.ts`,
and supersede this decision with the new spend bound written down.
