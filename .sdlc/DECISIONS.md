# Decisions

**Every decision in this repository is closed here, with the answer and the date.** A
decision that lives only in a chat log cannot be reviewed, diffed, or replayed by the next
agent — that is rule 1 of `AI_NATIVE_SDLC.md`, and a question carried at the end of a
message violates it exactly as much as a design does.

This file exists because 102 open questions had accumulated across 48 intents with no
mechanism that could ever close one. An intent's `## Open questions` section is where a
question is *raised*. This file is where it *ends*.

`scripts/decisions-lock.test.ts` is what makes that a mechanism rather than a sentence. It
checks three things and no more: the repo-wide open-question count stays at or under the
ceiling in `.sdlc/bands/open-questions.json`, no row here is half-written, and no id is used
twice. It does **not** verify that a question closed here was struck from the intent that
raised it — that is step 3 below and it is on the author, because matching a table row to a
prose bullet is a guess and a gate that guesses is worse than none.

**The default is to decide.** A decision needing the owner is one where the answer changes
what gets built and the tree cannot answer it — a published claim, a band, a package's
identity. Everything else is taken, written down, and revisited only if it turns out wrong.
"Taken" below means exactly that: the agent decided, and the decision stands until someone
reverses it here.

| # | Decision | Answer | Taken / Accepted | Date |
| :--- | :--- | :--- | :--- | :--- |
| D-001 | clack's compat row: publish a stated subset or the raw measurement | **Stated subset**, the `cli-table3` shape — subtract with the reason in `conditionalCases`. 289 of clack's 444 assertions snapshot its exact drawing; a façade matching them would *be* clack, which caique's design rejects (U3). The behavioural remainder is `limit-options` (14) + `guide` (3) | Taken | 2026-09-20 |
| D-002 | One intent for the façade programme, or one per façade | **One** — `facade-per-incumbent`, with per-package requirements appended to existing designs. The finding is uniform; eleven near-identical intents is ceremony, not a handoff | Taken | 2026-09-20 |
| D-003 | caique, paratext and closeout have no status ledger: backfill fully or only the façade rows | **Fully.** A ledger covering three rows of twenty-three reads as complete and tells the reader less than no ledger at all | Taken | 2026-09-20 |
| D-004 | `burgee/meow`, `burgee/cac`, `burgee/citty` — in the programme or out | **In as requirements, last in the order.** Writing the requirement costs nothing and stops them being invisible; building them waits behind rows with real gaps | Taken | 2026-09-20 |
| D-005 | The `core-under-52kb-bundled` claim, broken at 57,880 against 53,248 | **Restate at the measurement**, naming `completions.js` (7,763 B, inlined by esbuild under `--outfile`) as the largest single item. Making `--mcp`, `--schema`, `completion` and plugins opt-in to hit a byte count would remove the reason burgee exists | Taken — reversible by the owner, it is a published claim | 2026-09-20 |
| D-006 | Façade subpath or package root as the compat target | **Subpath, always.** Every row at 100% targets a dedicated subpath; every row at or near zero targets the root, which presents the package's own native API and can never match an incumbent's | Taken | 2026-09-20 |
| D-007 | When a façade may be named in a host row | **Only once it exists.** Naming an unbuilt façade publishes "target not built yet" where a measured number belongs — the lesson `cli-table3`'s note already records | Taken | 2026-09-20 |
| D-008 | What burgee leads with | **What it replaces, never speed.** `npm i burgee` stands in for twelve packages and their trees against one with no runtime dependencies. burgee starts at 2.57x cac and bundles 5.5x it; leading with speed invites the benchmark it loses. See `.sdlc/research/migration-drivers.md` §3, §4 | Taken | 2026-09-20 |
| D-009 | Whether to ship a codemod | **Yes — `burgee migrate`.** Every migration that actually happened shipped one before the wave, not after: `jest-codemods`, `pnpm import`, `biome migrate eslint`. "Change one import" is already the strongest version of this claim in the family; the codemod is what turns it from *could* into *did, in four minutes* | Taken | 2026-09-20 |
| D-010 | `--mcp`'s place in the positioning | **Table stakes, not the moat, and never what byte budgets are cut to fit.** A CLI costs an agent nothing until called; an MCP server's tool definitions are loaded before any work happens and cost tokens every turn whether used or not. The moat is a CLI legible without a server — `--schema`, `--json`, exit codes, and `fix:` naming a command rather than describing a problem. See §6 | Taken | 2026-09-20 |
| D-011 | `--schema` output shape | **Progressive disclosure: one command's contract, not the whole tree.** A `--schema` that dumps every command is the MCP mistake in CLI clothing — paying up front for what is not used. `commandSchemaOf` already scopes to one node; the flag must too | Taken | 2026-09-20 |
| D-012 | The highest-value unbuilt thing | **Agent tokens per completed task, burgee CLI against the same capability as an MCP server.** The `agent-tokens-per-task` and `agent-turns-per-task` bands exist and have never run. A first-party number on a live industry argument, made credible by the same discipline as the compat rows | Taken — needs a credential, which is the owner's | 2026-09-20 |

## How a question gets closed

1. It is raised in the intent that owns it, under `## Open questions`.
2. It is answered here — a row, an answer, a date, and whether it was **taken** by an agent
   or **accepted** by the owner.
3. It is struck from the intent's `## Open questions`, because it is no longer one.

`npm run decisions` lists every question still open across every intent, so the count can
only go down deliberately. A question that has been open for two weeks is a decision nobody
is making, which is itself a decision — made slowly, and by default.
