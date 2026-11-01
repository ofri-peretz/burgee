---
id: B-20261101-b1-real-cli-arm-oxmutate
section: B
status: open
source: first-adopter A5, graded open in D-20261101-first-adopter-is-oxmutate
recommendation: 'Give the agent axis a real-CLI arm for oxmutate: its own task files (`benchmarks/tasks/oxmutate/*.json`, each check proven red on the empty result and green on its exemplar by `tasks.test.ts`), a shim named `oxmutate` (the name its help prints, per D-20261008-b1-tool-name), a `success-rate` record that is reported but not gated, as the MCP arm''s are, and absolute tokens, turns and success with no ratio, because oxmutate has no off build. Opt-in by a repository variable, as `B1_MCP_ARM` is, so merging the harness spends nothing. A5 is met by the first scheduled run that lands a reading for it'
---

`first-adopter` A5 asks that `cli-benchmarks` B1 run against the real CLI as well as the demo.
On 2026-11-01 the owner ruled that oxmutate is the first adopter, so the real CLI is oxmutate's.
A variant that is only data and config cannot measure it:

- **The tasks are the demo's.** `benchmarks/axes/agent.ts` runs every task in `benchmarks/tasks/`
  against every variant. All five name the demo's commands and answers (`structured-output` asks
  for `user.name` and checks for `ada`). oxmutate has `run` and `survivors`, and no `config`.
- **The tool is named `demo`.** `installTool` puts one shim called `demo` on the agent's PATH,
  because the name the CLI prints must be the one the agent can run (D-20261008-b1-tool-name).
  oxmutate prints `oxmutate`.
- **The gate would fail the weekly run.** Each CLI variant's `success-rate` record carries
  `gate: { min: 0.8 }` (`SUCCESS_FLOOR`), and `bench.yml` runs the axis with `--check`. An
  oxmutate variant on the demo's tasks would pass none of them, so the weekly B1 job would go red,
  and it would spend 25 more paid sessions a week (5 tasks × `RUNS_PER_TASK` 5) to do it.
- **B1 compares layer on with layer off.** The demo has a commander twin. oxmutate was born on
  burgee and has no off build, so its reading is absolute, not a ratio.

So the arm needs code in the harness (a task set per variant, a shim name per variant, an ungated
record) and a paid weekly spend. That is a decision before a build, so this is B. The MCP arm
went the same way: its own intent, `.sdlc/intents/b1-mcp-arm/`, and a spend bound the owner set.
