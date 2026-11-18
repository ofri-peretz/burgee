---
id: D-20261118-contracts-program-go-ahead
subject: 'The contracts program: may the agent write the roadmap, its intents and designs, accept them, and start building, without asking?'
taken: Taken
date: '2026-11-18'
superseded_by: —
---

**Yes.** The owner's words, 2026-11-18: "I would like us to keep iterating on the vision. the entire
night you should enhance the roadmap, how we will become the best in the OSS community in contracts,
and code generators for them", then "You have the entire night to loop building a roadmap full of
intent.md and plan.md-s and once you're satisified and they are optimizated for many sub-agents to
execute them in parallel move to implementation. Do NOT ask me anything you have full permissions to
do whatever you find following best practices and OSS standards."

Read as, for the intents of Wave 6 in [`PLAN.md`](../PLAN.md) and the program in
[`apicontract/program.md`](../intents/apicontract/program.md):

- the Design→Build accept for each workstream intent whose `spec.md` lands in the program PR, so
  those intents are `approved`. The reading is the agent's; the words are the owner's.
- "plan.md" is this repository's `spec.md`, as already read in
  [`D-20261113-apicontract-build-go-ahead`](./D-20261113-apicontract-build-go-ahead.md). The
  execution side of a plan (owned paths, steps, the command that says done) lives in `PLAN.md`
  Wave 6 and `LANES.md`, so `scripts/dispatch-lanes.ts` prints each lane's brief.
- each default an intent takes in place of a question is listed in that intent's `## Defaults
  taken`, so the owner can reverse any one without reading the rest.

**Not covered:** Deploy. Nothing is published to npm, no package leaves `private: true`, no name is
reserved, and no release PR is merged. Those stay with the owner, as on 2026-11-13.
