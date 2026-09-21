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

## Who decides

**The default is to decide.** An agent working in this repository takes the decision, writes
it down here, and continues. It does not end a message with a question it could have
answered. Four kinds go to the owner and nothing else does:

| Escalate | Because |
| :--- | :--- |
| A **published claim** changing — a number or promise on a README, the docs site, or npm | It is a promise to people outside the repo, and retracting one costs more than making it |
| A **band or ceiling** moving in the loosening direction | Ratchets exist so growth is a decision; an agent raising its own ceiling is the failure the ratchet was built to catch |
| A **package's identity** — what it is for, what it refuses to be | caique not wrapping clack is the reason caique exists; that is not an implementation detail |
| **Money, publishing, or anything outward-facing** — npm, a metered API, an upstream PR | Irreversible, and not the agent's to spend or say |

Everything else is taken. A tie is broken by: the option the tree can already prove, then
the smaller diff, then the one that is easier to reverse. If a decision later turns out
wrong, it is reversed here with the reason — which is cheaper than every session re-deriving
the same answer and cheaper still than never deciding.

**Taken** below means the agent decided and it stands. **Accepted** means the owner did.
An escalated decision sits in the table with `Owner` in the fourth column and a default
beside it, and the default is what happens until the owner says otherwise — a question with
no answer is a decision to do nothing, made slowly.

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
| D-013 | bellpull: streaming | **Out of scope until `execa` is a graded host; a subpath (`bellpull/stream`) when it is.** A result-shaped API and a streaming API are different products, and nothing grades streams today | Taken | 2026-09-20 |
| D-014 | bellpull: how much of execa's surface | **The `run` result shape only.** The template-literal `` $`cmd` `` form is sugar over the same result and a different product shape; grading the result covers the behaviour | Taken | 2026-09-20 |
| D-015 | bellpull: does `open` fold in | **No.** It launches a URL or file in the desktop rather than running a child for its output, and it would add a platform-detection surface this layer otherwise does not have. One package, one problem | Taken | 2026-09-20 |
| D-016 | bellpull: is `duration` honest | **Drop it.** Wall-clock from spawn to close includes Node's own scheduling, so publishing it as the child's cost is a number we cannot defend. Measured or it is a slogan | Taken | 2026-09-20 |
| D-017 | closeout: the default deadline | **2000 ms, finite, and revisited against measurement.** Long enough for a filesystem flush and an in-flight request to abort, short enough that an agent is never stuck. Finite by design, so the failure mode is a truncated flush rather than a hang | Taken | 2026-09-20 |
| D-018 | closeout: is `exitCode` preserved on every path | **Yes, unconditionally — a handler must never turn 3 into 0.** If `signal-exit`'s suite does not assert it, it becomes one of our own conformance cases | Taken | 2026-09-20 |
| D-019 | closeout: does `once` / `onetime` belong here | **Keep it.** Exactly-once is the package's whole thesis and its name; 162 M/wk of demand for it is the argument. Widening slightly past the name is cheaper than a package of one function | Taken | 2026-09-20 |
| D-020 | closeout: worker threads and `beforeExit` | **Per-thread, and documented as per-thread.** Being narrow is better than being wrong, and a cross-thread exactly-once claim we cannot test is the wrong kind of promise | Taken | 2026-09-20 |
| D-021 | seniority: does `resolve` stay synchronous | **Yes.** `fs.existsSync` in a bounded loop keeps the API trivial and the sync half is what cosmiconfig's suite grades. A dual API is added only when a graded host actually needs one, never speculatively | Taken | 2026-09-20 |
| D-022 | seniority: how much of cosmiconfig's search semantics | **Whatever its suite grades, and every divergence listed in `conditionalCases` with a reason.** That is already the doctrine for every other host; nothing here is special | Taken | 2026-09-20 |
| D-023 | seniority: does `env-paths` belong in seniority or closeout | **Neither.** OS config-directory resolution is neither precedence nor lifecycle, and folding it in widens both layers past their names | Taken | 2026-09-20 |
| D-024 | linegauge: does `wrap` reopen styles per line | **Match `wrap-ansi`, because its suite is the grader.** Where the suite does not cover the trailing-whitespace disagreement, the divergence is written down rather than resolved by preference | Taken | 2026-09-20 |
| D-025 | linegauge: is `ansi-regex` a subpath or an internal | **Internal.** Exporting a regex is a compatibility liability forever — every future fix to it becomes a breaking change. 345 M/wk is a reason to be careful, not a reason to publish | Taken | 2026-09-20 |
| D-026 | roundel: does `./policy` become its own package | **Stays in roundel.** `flagstaff` peering on `roundel` for one function is acceptable; a package of one function is not an independent product, which is the bar rule 8 sets | Taken | 2026-09-20 |
| D-027 | roundel: `chalk.level` and `chalkStderr` against one policy | **Both honoured, both as views of the one policy** — `level` reads and writes the policy rather than shadowing it, and `chalkStderr` is a second instance bound to stderr. Two models would be two answers to what colour is on | Taken | 2026-09-20 |
| D-028 | flagstaff: plugin discovery | **Explicit `register()` only.** Z1 says nothing may require a config file, and a `burgee.plugins` array in `package.json` is a config file wearing a different hat. Discovery is added only if `cli-modularity` needs it for its own plugins | Taken | 2026-09-20 |
| D-029 | flagstaff: character and mascot plugins | **A spinner with named states — no new key.** A state-keyed frame set is the same shape as a spinner with more states, and the smaller answer is the right one | Taken | 2026-09-20 |
| D-030 | paratext: does `image` accept a path | **Buffer only.** The caller reads the file and owns the I/O, which keeps `node:fs` out of a package that otherwise touches nothing | Taken | 2026-09-20 |
| D-031 | paratext: where the terminal Support table lives | **A data file a plugin can replace wholesale.** It is the part that rots, and rot belongs where it can be replaced without a release | Taken | 2026-09-20 |
| D-032 | seniority: what `config-layers` actually does | **F3 does not open until it has been read.** Published the day seniority was measured, so it is a prior-art check rather than a design choice; it becomes a requirement in seniority's design, not a standing question | Taken | 2026-09-20 |
| D-033 | linegauge: the honest fast-path threshold | **Whatever the measurement says.** `Intl.Segmenter` at 3.5 µs per 50-character segmentation is one point, not a curve; the ASCII fast path is gated at the crossover the benchmark finds, and the benchmark is a requirement | Taken | 2026-09-20 |
| D-034 | compat-grader-layer: the package name | **Owner.** Default until they say otherwise: **`loadline`** — free on npm as of 2026-09-14, nautical like the rest of the family, and the metaphor is exact: a published limit, verified by survey, that you may not cross | Owner — default stands | 2026-09-20 |
| D-035 | compat-grader-layer: does the grader leave this repo | **Owner**, because it is a rule-10 identity call. Default: **it stays, burgee-family only.** Making it its own family means the 322 vendored suites travel with it, which is a far larger move than a rename, and until someone pays for that move `eslint/` keeps making compatibility claims with no instrument | Owner — default stands | 2026-09-20 |
| D-036 | compat-grader-layer: what happens to `conformance` | **No change — private, adjacent, out of this intent's scope.** It was never covered by this intent's evidence and inventing coverage for it here would be a claim with nothing behind it | Taken | 2026-09-20 |
| D-037 | compat-grader-layer: do the vendored suites ship in the tarball | **No.** 322 files of other people's tests under their own licences is a licence question, and shipping them by default answers it in the riskiest direction. The grader ships with `vendor-suite`, which already fetches them on demand | Taken | 2026-09-20 |
| D-038 | compat-grader-layer: the four changesets | **Retired.** Their prose already lives in the commits that introduced them, and a changeset that restates a landed commit inflates a release note without informing anyone | Taken | 2026-09-20 |
| D-039 | upstream-watch: where the fingerprint lives | **`packages/<pkg>/competitors.json`, one file per package**, holding the declaration and the last-seen fingerprint — so a competitor moving is a git diff a human reads in a PR. A central file is one thing to lock and breaks constraint 5 | Taken | 2026-09-20 |
| D-040 | upstream-watch: does the surface diff read `.d.ts` or exports | **Both, `.d.ts` preferred when present.** A type-only addition is a real API addition and is invisible to a runtime export scan | Taken | 2026-09-20 |
| D-041 | upstream-watch: does a stale weight claim fail CI | **Open an issue, never fail the build.** A competitor getting heavier is not our regression, and a red build we cannot fix by changing our own code is a broken feedback loop | Taken | 2026-09-20 |
| D-042 | upstream-watch: do `hosts.ts` and `competitors.json` merge | **No.** A host is something we run a *test suite* from and needs a repo, a runner and a shim; a competitor is something we measure a *surface* against and needs only a name. Every host is a competitor; most competitors are not hosts | Taken | 2026-09-20 |
| D-043 | brand-burgee: does it belong in this repo | **Owner.** Default: **it moves to `interlace`.** It shares the "one declaration, many projections" thesis and nothing else — not argv, not the manifest — and rule 10 is one repo per family | Owner — default stands | 2026-09-20 |
| D-044 | brand-burgee: is a supplied glyph embedded in the field | **No — the generator emits the two-tone field only.** Keeping a raster legible at 16px inside an SVG is a different problem from colouring a locked shape, and solving it by accident is how a generator stops being deterministic | Taken | 2026-09-20 |
| D-045 | brand-burgee: is the generator itself a burgee CLI | **Yes.** It is the honest dogfood — a real command answering `--json`, `--schema` and `--mcp` like any other — and a generator that is not one would be an argument against our own thesis | Taken | 2026-09-20 |
| D-046 | brand-burgee: which raster formats, against which rasteriser | **PNG only, at 1x and 2x.** The rasteriser is whichever the docs site already depends on; adding a new one is a dependency decision under rule 2 and does not ride along with a format list | Taken | 2026-09-20 |
| D-047 | cli-foundation-stack: does `seniority` move ahead of `linegauge` | **Yes, pull it forward.** Biggest layer at 1.81 B/wk and the cheapest to start because `precedence.ts` already exists; the criterion for pulling it forward is already recorded in `design.md` | Taken | 2026-09-20 |
| D-048 | cli-foundation-stack: does `bellpull` survive a re-check against `tinyexec` | **Yes, and the re-check is in.** bellpull grades 68 / 68 on cross-spawn's own suite *and* fixes the Windows `PATHEXT` defect upstream still carries. The weight pitch was never the pitch (D-008), so `tinyexec` owning it is not a kill signal | Taken | 2026-09-20 |
| D-049 | cli-foundation-stack: does `config-layers` become a competitor | **Yes — it goes in `packages/seniority/competitors.json`** under D-039. Somebody publishing into your layer the week you measure it is exactly what the watch exists to notice | Taken | 2026-09-20 |
| D-050 | `burgee migrate`: parser or specifier scan | **Specifier scan, no parser.** Rule 2 forbids a runtime dependency and the rewrite surface is a quoted string in five known positions. The cost is that unclassifiable positions are refused rather than handled, and that cost is paid in a report rather than silently | Taken | 2026-09-20 |
| D-051 | `burgee migrate`: what happens to a file it cannot fully migrate | **Nothing — the whole file is left untouched and listed.** A half-migrated file fails later as a runtime error in someone else's CLI, and burgee gets blamed first. The unit of success is the file | Taken | 2026-09-20 |
| D-052 | `burgee migrate`: interactive or not | **Non-interactive by default.** The second audience is an agent migrating a repository unattended; a prompt is a wall. Safety comes from refusing a dirty git tree and from `--dry-run`, not from asking | Taken | 2026-09-20 |
| D-053 | `burgee migrate`: does it rewrite API calls too | **No — imports only.** `program.parse()` is the same call on both sides; that is what 1360 / 1360 means. Editing call sites would be claiming the façade is not drop-in, which is the opposite of the product | Taken | 2026-09-20 |
| D-054 | `burgee migrate`: does it edit `package.json` | **No.** The report says which dependencies became removable; removing them is the maintainer's commit. A codemod that edits a manifest is a codemod that resolves a lockfile, and that is not this | Taken | 2026-09-20 |
| D-055 | `burgee migrate`: how fast is fast enough | **A measured budget, not an adjective: 1,000 files under 500 ms, any single file under 1 ms**, gated on the number. One text pass, no AST — which costs two orders of magnitude less *and* costs no dependency, so the fast choice and the rule-2 choice are the same choice. A codemod a person watches is one they run once and never again | Taken | 2026-09-20 |

## How a question gets closed

1. It is raised in the intent that owns it, under `## Open questions`.
2. It is answered here — a row, an answer, a date, and whether it was **taken** by an agent
   or **accepted** by the owner.
3. It is struck from the intent's `## Open questions`, because it is no longer one.

`npm run decisions` lists every question still open across every intent, so the count can
only go down deliberately. A question that has been open for two weeks is a decision nobody
is making, which is itself a decision — made slowly, and by default.
