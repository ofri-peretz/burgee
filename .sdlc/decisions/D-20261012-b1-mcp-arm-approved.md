---
id: D-20261012-b1-mcp-arm-approved
subject: 'b1-mcp-arm: is the MCP arm''s paid spend approved, and what stops it?'
taken: 'Accepted — the owner''s spend, set as the repository variable on 2026-10-12 and recorded under the owner''s delegation of the same day'
date: '2026-10-12'
superseded_by: —
---

**Approved. The repository variable `B1_MCP_ARM=approved` was set at 2026-10-12T15:51Z, so
`bench.yml` sets `BENCH_AGENT_MCP=1` on the weekly schedule and on a `bench:agent` PR, and
nowhere else.** This is money, which `DECISIONS.md` sends to the owner; the owner set the
variable, and this file records the bound and the stop rule.

**Value gained.** The four weekly readings that [b1-mcp-arm](../intents/b1-mcp-arm/spec.md) R5
and `cli-mcp`'s fourth success criterion need: the same three tasks driven over MCP and over
the CLI from one declaration, so "CLI and MCP, one declaration" on `what-an-agent-sees.mdx`
cites measured runs rather than a claim.

**Spend.** 15 runs per weekly reading (3 tasks x 5) on top of the 50 the CLI arms already
make, 60 extra over the four readings. Each run is bounded exactly as a CLI-arm run is: the
task's `maxTurns` (12 or 15), a 300 s timeout, and the pinned `claude` on its pinned model.

**What the incumbent pays for the same.** The CLI arms pay 50 runs per reading for their
comparison; the MCP arm is 30% on top of that for the one comparison no incumbent CLI can make,
because commander and yargs have no MCP surface to measure.

**Stop rule.** After the first reading, record tokens per run beside the reading. If the arm's
per-reading cost exceeds the 50-run CLI arms' total, or once the four readings are in, revisit
in a new decision. To stop, unset `B1_MCP_ARM` (Settings -> Secrets and variables -> Actions ->
Variables); the next run spends nothing, and `ci-axes.test.ts` holds that the arm never runs on
a push to `main` or a manual dispatch.

**Reversal.** Unset the variable. Nothing else in the tree changes.
