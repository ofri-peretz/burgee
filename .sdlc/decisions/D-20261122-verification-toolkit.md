---
id: D-20261122-verification-toolkit
subject: 'What is the family for?'
taken: Taken
date: '2026-11-22'
superseded_by: —
---

**The family is the code half of every verification station, so the model keeps only judgment.** The
owner, 2026-11-22: "the point is to become the toolkit of Anthropic's verification steps in all stations
to let the LLM focus on what it knows best", "reduce redundant context for the LLM constantly", and "lets
iterate until we nail all steps and tools". The frame is the Snappy Agent Playbook's first rule, "Code
decides facts. Claude decides meaning.", which cites Anthropic's "How the Claude Code team thinks about
verification" (November 2026).

Two tests for any new feature or package:

1. **Which station does it serve, and which fact does it take off the model?** A feature that asks the
   model to re-check a fact on every run fails; a check that decides it once, the same way every time,
   passes.
2. **Does it hand the model less to hold?** Output is the smallest thing that answers: findings, not
   logs; the changed part, not the whole document; a pointer and a `fix:`, not prose. Every product CLI
   is a burgee program, so `--json`, `--schema`, MCP and exit codes come with every command.

## Who owns which station

| Station (playbook) | Fact taken off the model | Tool | Still missing | Intent |
|---|---|---|---|---|
| Put each rule where it can't be forgotten | "where should this rule live?" | **rulehome** `audit` (seven homes) | on burgee, in the family | [`rulehome`](../intents/rulehome/) |
| Automatic code checks | "is this shape allowed?" | Interlace eslint plugins; `contractdiff lint` | lint not built | [`apicontract-lint`](../intents/apicontract-lint/) |
| Checks before push | "did I run the checks?" | hookset: lefthook/Husky presets by station, a Claude hook pack | not built | [`hookset`](../intents/hookset/) |
| Agreements between systems | "breaking, and decided?" | `contractdiff diff` + decision markers | in review; rulehome `intent` folds into it | [`apicontract-diff-decisions`](../intents/apicontract-diff-decisions/) |
| | "compatible with every past release? used?" | `contractdiff diff` | transitive, dangerous, usage-aware | [`contractdiff-compat-depth`](../intents/contractdiff-compat-depth/) |
| Short notes, how-tos on demand | "is this skill or agent well formed?" | rulehome `skills`, `agents` | on burgee | [`rulehome`](../intents/rulehome/) |
| Give the AI less to hold | "which part matters here?" | `explain`, `--since`, findings-only output | operation selection for spec → MCP | [`contractdiff-compat-depth`](../intents/contractdiff-compat-depth/) R6 |
| Write "done" down first | "is there a list, and is each item tested?" | the intent/spec flow (our repos only) | out of scope until asked | — |
| Tests it can't game | "does it behave like the incumbent? on inputs it didn't pick?" | compat-oracle; generated contract tests; `props` | property tests not built | [`contract-properties`](../intents/contract-properties/) |
| Test the tests | "would a test catch a bug here?" | **oxmutate** | nothing: covered | — |
| Reviewer with our rules | "does this follow our rules, in a rulebook the reviewer can hold?" | lint `--json`; triggerlist | not built | [`triggerlist`](../intents/triggerlist/) |
| Say how it was checked | "what was and wasn't checked?" | proofline: `Verified-by:` trailer and PR block, re-run evidence | not built | [`provedone`](../intents/provedone/) (was proofline) |
| Learn from every miss | "which rules and reviews earn their keep?" | `lint --stats --idle`; replz | replz not built | [`replz`](../intents/replz/) (was replay) |
| Machine-readable everything | "what did the tool say?" | burgee | pagination/truncation metadata | burgee backlog |

Not a tool's job: trying the change in the app (browser and simulator tools exist), stopping after three
failed tries (one line in the notes), choosing the model, writing the request.

Judgment stays with the model and the owner: whether a change was meant, whether a name is clear, whether
a field changed meaning under the same name. The tools gather the evidence; they never make that call.

Evidence for the contract rows: [`../research/contract-landscape-2026-11-22.md`](../research/contract-landscape-2026-11-22.md).
