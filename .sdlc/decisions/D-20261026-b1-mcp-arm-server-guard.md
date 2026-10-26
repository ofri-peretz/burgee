---
id: D-20261026-b1-mcp-arm-server-guard
subject: 'b1-mcp-arm: the first paid run of the arm never reached its MCP server. What does the harness check before and during a run, and what does a broken or weak arm do to the reading?'
taken: 'Taken by the coordinator under the owner''s delegation (burgee-owner-delegates-tradeoffs), 2026-10-26'
date: '2026-10-26'
superseded_by: —
---

**The arm now proves its server before it spends a run, and a run without the server is not a run
of the arm. When the arm is broken or weak, it leaves its success rate and the reason, ungated,
and no ratio. The week's CLI reading still lands.** Nothing paid was run to reach this. The
evidence is the 2026-10-20 weekly job and its uploaded transcripts.

**What happened on 2026-10-20** (run 39407740629, the first scheduled run with
`B1_MCP_ARM=approved`):

- All 15 `burgee-mcp` transcripts open with `"mcp_servers":[{"name":"demo","status":"failed"}]`.
  The agent had no MCP tool. It tried `Bash`, which the arm does not allow, and was refused.
- **Cause.** The config came from the demo's `--mcp --print-config` (mcp-current R6, built
  2026-10-12). It names the demo's bin, `demo-burgee`, and the harness handed that to `claude` as
  written. Nothing installs the build under test under that name. The likeliest path: under
  `npm run bench` the name resolves to `node_modules/.bin/demo-burgee`, a symlink to
  `examples/demo-cli-burgee/dist/bin.js`. On the runner `tsc` writes that file after the install
  step, which the log shows skipped on a cache hit, so it has no execute bit. Either way, the bin
  name says nothing about which build runs. The R2 test asserted the printed command was used
  verbatim, so it held the defect in place.
- **1 of the 15 runs passed its check** with no server. That one pass meant the arm did not
  "fail every run", so it got the CLI arms' gated success rate (0.067 against 0.8). The gate
  failed `--check`, the job failed, and the week's CLI reading (burgee ÷ commander tokens 0.519,
  turns 0.544) never landed. The arm's ratio (tokens 1.414) was computed over runs that never
  touched MCP. It did not land either, so no landed file carries a false MCP reading.
- **Spend, per the stop rule in D-20261012-b1-mcp-arm-approved:** the arm's 15 runs used 1,856,328
  tokens. The CLI arms' 50 runs used 5,639,658 (burgee 1,926,865, commander 3,712,793). That is
  33% of the CLI arms' total, under the stop rule's 100%. The spend stands.

**What the harness does now** (`benchmarks/axes/agent.ts`, held by `benchmarks/agent.test.ts`):

1. **The config starts the build under test.** It keeps the server's name and arguments from
   `--print-config`. The command is the same shim the CLI arms run, by absolute path.
2. **Preflight.** Before the arm's first run, the harness starts that server the way a client
   does (`initialize`, `notifications/initialized`, `tools/list`) in the agent's environment. A
   server that lists no tools makes the arm broken. The arm records why, in the server's own
   exit status and stderr, and spends nothing.
3. **Per-run guard.** A run counts as a run of the arm only when `claude`'s own `init` event
   reports the server `connected`. Any other status, or no `init` event, makes the run a failure
   of kind `mcp-unavailable`. Such a run is in no median, whatever it answered.
4. **No reading, loudly, and the CLI reading lands.** The arm leaves an ungated success rate,
   its reason, and no `burgee-mcp ÷ burgee` ratio in these cases: it was broken before running;
   it failed every run; the usage limit cut it short; any run had no server; or fewer than 0.8 of
   its runs passed. No ratio means the week never counts toward `cli-vs-mcp-tokens`.

**Why the weak arm is ungated rather than failing the job.** The 0.8 floor gates the harness, so
that medians are not taken over whichever runs survived. For the CLI arms, the bands and the 40%
claim read that reading, and failing the job is the right response. The MCP arm feeds no band.
Failing the job for it costs the CLI arms' reading, which is what happened on 2026-10-20. What
the floor protects is the medians, and leaving no ratio protects them the same way. The arm's
success rate is still published in the landed file, whichever way it falls.

**Rejected.**

- Using the printed command and putting the bin on PATH. That makes the config depend on what the
  runner resolves `demo-burgee` to. The absolute shim does not.
- Excluding the server-less runs and keeping the rest as a reading. The comparison is every
  mapped task over MCP. A reading of the runs that happened to find the server compares a
  different task mix, which is the cut-short rule (evals-record-not-run R6) again.
- Failing the CLI reading when the arm breaks. That is how 2026-10-20 lost a week of CLI data.

**What closes the intents.** Unchanged in substance. The 2026-10-20 run is no reading, so the
count is 0 of 4. `b1-mcp-arm` R5 and `cli-mcp` criterion 4 close once four landed
`*-weekly-ci.json` files under `benchmarks/results/agent-cli-bench/` each carry a
`burgee-mcp ÷ burgee` `mcp-tokens-total-ratio` record. Under this harness that record exists
only when every MCP run connected and at least 0.8 passed. The fourth such file carries
`mcp-tokens-total-ratio-readings-median`, and `cli-vs-mcp-tokens` computes from it.

**Reversal.** Revert the four checks in `agent.ts`. The arm then runs exactly as it did on
2026-10-20.
