# burgee intents — execution tracker to `shipped`

> **Committed 2026-10-18 by Batch 0**, the docs-only PR that applied section (b) and the drops,
> so the batches still to run work from a file and not from a scratchpad. The **status** column in
> (a) shows the status each intent has after Batch 0. The other columns are the audit of `main`
> at `c51e25efe1` as it was taken. Section (c) is the forward queue. Each later batch updates its
> own rows here in the PR that lands it.

Read-only audit of every `.sdlc/intents/<name>/` on `main` at **`c51e25efe1`** (2026-10-18).
89 intents, excluding `_template`, `cli-modularity` (shipped), `commander-agent` and
`yargs-agent` (dropped). Each requirement was located on `main` with `git grep` /
`git ls-tree` against `FETCH_HEAD`. No test was run, so "exists" means the check is on main,
not that it passes today.

**Status on main:** 39 approved · 33 review · 17 draft, before Batch 0.

**After Batch 0:** 18 shipped · 30 approved · 26 review · 7 draft · 11 dropped, counting
`cli-modularity` and the two earlier drops. Three of those approvals landed beside Batch 0:
`first-cli` (#1092), and `migrate-pins-carry-the-drop-in` and `release-cadence` (#1124). 17 intents were stamped `shipped`. 9 were dropped,
each with a `D-20261018-drop-<slug>` decision. `localised-human-surfaces` stays `approved`: its
criterion 4 needs an executed eval run.

**After batch 27 (2026-10-25), on top of batch 28's design gates (#1245):** 47 shipped · 32
approved · 1 draft · 15 dropped, of 95 intents. burgee 1.7.0 / 1.7.1 and caique 1.5.0 published that day, and six intents were stamped
from the released packages: `default-command`, `completion-context`, `migrate-preflight`,
`migrate-dynamic-specifiers`, `migrate-older-majors` and `inquirer-prompts-drop-in`.
`previous-majors`, stamped on 2026-10-19 before its changesets published, gained its release line.
`typed-positionals`, `first-cli` and `locale-pack-in-five` were re-read on the release and held,
each with what remains in its own status section.

**Classes:** 18 LIKELY-SHIPPABLE · 40 PARTIAL · 14 NOT-STARTED · 8 NEEDS-SPEC ·
9 DROP (by the coordinator's ruling).

**In progress elsewhere:**
- `migrate-pins-carry-the-drop-in` and `release-cadence`: batch 1, local agent.
- `mutation-tested`: a new intent for a Stryker gate, batch 2, local agent. It is not on main yet.
- `first-cli`: PR #1092 is open, with 33 checks green and 6 skipped, but it is DIRTY and needs a rebase.
- `previous-majors`: PR #1086 (commander 14; R1, R2, R6) is open, but it is DIRTY and needs a rebase.

## Corrections and rulings applied

- **Quint does run in CI.** One audit group reported that it does not. That is wrong.
  `.github/workflows/models.yml` runs every tracked `.qnt` with
  `quint run --invariant=safety --max-steps=30 --max-samples=20000`. It also runs
  `registry.qnt --invariant=lateAddRuns` as an expected violation. It ran on #1097
  (2026-10-13). It is simulation, not proof. Its `paths:` trigger covers `**/*.qnt` and a fixed
  list of sources: closeout, `flagstaff/src/ora.ts`, `burgee/src/dev.ts`, `release.yml` and
  `caique/src/clack-core.ts`. A new model's source files must be added to that list.
- **DROP, by the coordinator's ruling.** The five `control-band-*` intents. Four bands are back
  inside. The fifth, `yargs-front-end-bundled-bytes`, shows only a new +31 B 1σ drift, which never
  gates, and its original breach is gone. Also dropped:
  - `security-profile`: no adopter, and its Q1 exit numbering clashes with `ExitCode` and `exit-code-lock`.
  - `eslint-plugin-cli-floor`: moved to the eslint repo as eslint#1137.
  - `compat-grader-layer`: its trigger is fixed by `changeset-reachable-lock`, and the rest conflicts with compat-oracle being internal.
  - `docs-deploy`: folded into `docs-per-package`.

  Each drop needs a header edit citing its reason. Two other intents depend on the eslint drop
  and must be restated: `burgee` F3, O3 and P1, and the `cli-mcp` lint rule.
- **The weekly eval of 2026-10-15** (`evals/history/2026-10-15-29362dc-38717342918.json`: 0/11,
  `model: null`, 0 tokens) **was the Claude weekly usage limit, not a credential failure.** It is
  a run that never executed, recorded as a failing run. **New defect queued:** record a run that
  never executed as `not-run`, never as a failure. It is in Batch 1. Until a real run lands, the
  eval criteria below have no current reading:
  - `plugin-contract` C4
  - `flagstaff` S7
  - `cli-output-stack` S8
  - `localised-human-surfaces` R7/S4
  - `locale-pack-in-five` R3
- **The earlier cloud reconciliation said 12 intents were shippable; 10 hold.**
  - `graded-override-targets` does not hold. SC3 has no fixture importing all six packages.
  - `linegauge` does not hold. The spec's R4 says rounding goes outward, but code and test round inward. R13 says "no plugin key", but a `widths` plugin exists. Both fixes are spec edits.

## (a) Table

Abbreviations used below:
- **Q?** = does the behaviour need a Quint model?
- **qnt** = the `.qnt` that exists for it.
- **LS** = LIKELY-SHIPPABLE · **P** = PARTIAL · **NS** = NOT-STARTED · **SPEC** = NEEDS-SPEC · **DROP** = dropped by ruling.
- A **restate** is an edit to the criterion text, not code.

| intent | status | spec? | class | lane | reqs | with check | unmet / missing-check Rs | Q? | qnt | notes |
| :-- | :-- | :-: | :-- | :-- | --: | --: | :-- | :-: | :-- | :-- |
| agent-headroom | shipped (built #1266; published in `burgee@1.7.2` by Version PR #1253, re-read on the tarball 2026-10-26, `D-20261026-shipped-on-published-patch`) | y | P | burgee/agent-surface + benchmarks | 10 | 10 | – (R5 and dotted R2 dropped at the design gate) | n | – | R6 nine failures byte-identical across `--json=`, `--format`, `--max-bytes`; RF `tsv` 59.2% under minified JSON; R3 whole-row cut parses; C1 large demo 41.1% |
| agent-lint-conformance | approved | y | P | burgee/agent-surface + floor | 8 | 7 | R7 (ratchet at 91, below the 94.9 reading); FS-4 regression | y (timeout timer vs settle) | registry.qnt (partial) | **LIVE DEFECT:** its own R4 auth row in help broke FS-4 |
| agent-skill | approved | y | P | burgee/agent-surface | 7 | 6 | C4 (the published reading fails SD-5; nothing gates SD-5) | n | – | Same CI floor reading as agent-lint R7 |
| agent-surface-declared | **shipped** (batch 0) | y | SHIPPED | burgee/mcp | 9 | 9 | – | n | – | The spec cites `effects.test.ts`, which is absent; tests are in `mcp.test.ts`. Fix the citation |
| b1-mcp-arm | approved | y | P | benchmarks + CI | 9 | 6 | R5 (no MCP page section), C2 (0/4 weekly readings), C3 | n | – | 10-13: the usage limit (D-20261019). 10-20: all 15 MCP runs had no server; R6 guards it (D-20261026-b1-mcp-arm-server-guard) |
| bellpull | **shipped** 2026-10-27 (`feat/bellpull-dogfood-spawn`) | y | SHIPPED | bellpull | 17 | 16 | – (C1 is a recorded reading, not a check) | **y** (deadline, SIGTERM, SIGKILL ladder) | **none** | Kill gate read 2026-10-26, verdict build ([D-20261026-bellpull-kill-gate-reading](../decisions/D-20261026-bellpull-kill-gate-reading.md)): tinyexec 1.3.1, 106.9 M/wk, resolves inside its spawn only. C4: compat-oracle and benchmarks spawn through `bellpull/cross-spawn` (`scripts/dogfood-spawn-lock.test.ts`, [D-20261027-bellpull-dogfood-spawn](../decisions/D-20261027-bellpull-dogfood-spawn.md)). C5 recipe executed by `apps/docs-bellpull/tests/examples.test.ts`. No release. The kill-ladder model is still missing (batch 15) |
| brand-burgee | **dropped** (batch 28, `D-20261025-brand-burgee-dropped`) | **n** | DROPPED | brand | 4 | 1 | – | n | – | Built before any design; write spec.md |
| burgee | approved (umbrella sweep 2026-10-26; Z5 bench and criterion 4 ratchet built 2026-10-26) | y | P | umbrella | 119 | 112 | – of its own; closes when every open child does (the grouped list is in `burgee/intent.md` § Umbrella sweep 2026-10-26) | partly | registry, prompt-session, dev-reload | Finding: the 2026-10-26 patches (burgee 1.7.2, roundel 1.2.1, seniority 1.1.1) already carry the code of the minors the release window holds; the window holds the version label, not the code (`release-cadence` R1) |
| burgee-migrate | **shipped** (batch 0) | y | SHIPPED | burgee/migrate | 12 | 12 | – | n | – | Stale header: needs draft → approved (owner) → shipped. Verification 3 is indirect |
| caique | approved (umbrella sweep 2026-10-26) | y | P | caique | 13 | 10 | criterion 2 (no B1 demo is layered on caique; R1 `promptFor` unbuilt), criterion 3 (no real-PTY prompt case, no Windows) | **y** | prompt-session, save-restore | Criterion 1 held by `decide.test.ts` and `binding.test.ts`. B1 `non-tty-required` 355 / 355 on the burgee arm (2026-10-08 to 10-18) is burgee P2, not caique. Closes with a build and a caique + burgee minor |
| caique-quiet-seam | **shipped** (batch 0) | y | SHIPPED | caique | 8 | 8 | – | n | – | Restate R2 (`progress` and `taskLog` were not ported, D-152) |
| caller-matrix | **shipped** (batch 29 built, #1252; five cells 2026-10-26) | y | SHIPPED | examples/conformance + docs | 5 | 5 | – | n | – | Registry, lock and `/docs/callers`; 48 held, 7 n/a, 0 missing, ceiling 0. S4 moved to first-adopter |
| ci-affected-lanes | **shipped** (`D-20261026-ci-affected-lanes-minutes`) | y | SHIPPED | workflows/CI | 7 | 7 | – | n | – | R4 read 2026-10-26: median compat job-minutes per PR 411.8 before #1101, 71.1 after (`ci-minutes.test.ts`) |
| cli-benchmarks | shipped (batch 29 built #1252; READMEs published by Version PR #1253, 2026-10-26) | y | P | benchmarks | 16 | 16 | – (published by Version PR #1253) | n | – | S4 as a series over 52 CI readings (tokens 0.502, turns 0.522), `claim-table-lock` restated; B7 link lock over 13 public files |
| cli-foundation-stack | shipped (batch 29 built #1252; READMEs published by Version PR #1253, 2026-10-26) | y | P | umbrella (foundation) | 17 | 17 | – (published by Version PR #1253) | n | – | Y4 builtin lock and absorption probe in compat.yml's floor job; Y12 lock found linegauge naming burgee. Probe baseline in the decision |
| cli-help-renderer | **shipped** (typed-schema-surface) | y | SHIPPED | burgee/help | 10 | 10 | – | n | – | S1's min/max row held 2026-10-19 |
| cli-mcp | approved (batch 28, `D-20261025-cli-mcp-design-accepted`) | y | LS | burgee/mcp | 16 | 14 | – (C4 is b1-mcp-arm's; lint rule moved to the eslint repo) | n | – | K1 "deps {}" → restate as "nothing outside the family" |
| cli-output-stack | shipped (2026-10-26: R12's README opening published in `flagstaff@1.7.5` by Version PR #1278, read from the tarball; S2 bill and R12 locked, D-20261026-output-stack-bill-and-opening) | y | P | umbrella (output stack) | 23 | 23 | – ; R3, R11, S5 moved to flagstaff and inquirer-prompts-drop-in, R2 held 2026-10-19 | n | – | `npm pack flagstaff@1.7.5` README byte-identical to `main`; `bench:page --check` and `dependency-bill-lock` pass |
| cli-packaging | review | y | P | release/packaging | 10 | 8 | R4 / S3 (`.map` negative fixture; `forbiddenInPack` untested) | n | – (release-tag.qnt is tags only) | One test closes it |
| cli-testing-harness | review | y | P | burgee/testing | 11 | 8 | S1 ANSI-in-non-TTY case, S2 and S4 restate | n | – | |
| clispec-conformance | **shipped** (batch 0) | y | SHIPPED | burgee/schema | 10 | 10 | – | n | – | Fix the C1 path (it is `scripts/clispec-document.test.ts`); the 24/24 reading is local, but bench.yml enforces ≥24 |
| closeout | approved (umbrella sweep 2026-10-26) | y | P | closeout | 17 | 15 | C3 spawn half (no `perf` row; [D-20261026-library-spawn-delta-rows](../decisions/D-20261026-library-spawn-delta-rows.md)); `/docs/benchmarks` still prints the 2026-10-19 bytes (2.929, 1.272) where CI reads 0.96 / 0.93 | **y** | **registry.qnt** | C1, C2, C4 held; C5 held as restated by D-133 (import swap via `burgee migrate`). Closes with a perf row and a new published bench measurement, no release |
| closeout-at-incumbent-weight | **shipped** (closeout 1.1.7, Version PR #1199, 2026-10-20) | y | SHIPPED | closeout + weight ratchets | 8 | 8 | – | **y** (each door its own once-guard; restated) | **lean.qnt** | Wave-4 #1. Design accepted D-20261020-closeout-weight-design-accepted; B4 0.960 / 0.930 |
| colour-facades | shipped (built #1218, #1233, #1255; published in `roundel@1.2.1` by Version PR #1253, re-read on the tarball 2026-10-26, `D-20261026-shipped-on-published-patch`) | y | P | roundel + compat-oracle | 8 | 8 | – | n | – | the published `dist` grades colorette 67 / 67, kleur 15 / 15, yoctocolors 78 / 78; B4 0.909, 0.561 / 0.903, 0.951; `burgee@1.7.2 migrate` rewrites all three and the fixture's tests pass |
| commander-compat | **shipped** (batch 3) | y | SHIPPED | burgee/commander-facade | 8 | 8 | – | n | – | Batch 3: X6 ratcheted 129,400 → 112,100 on a clean-build reading of 112,024 (D-20261019-commander-walk-budget-ratchet). X5 had no real check (`.`'s denied list never named the front-end), so one was added and proven red |
| commander-completions | **shipped** (batch 0) | y | SHIPPED | burgee/completions | 8 | 8 | – | n | – | Human accepts two restatements: Fig is structural, `complete` replaces `--dynamic`. CI's `completions.yml` is authoritative |
| commander-env | shipped (batch 29 built #1252; published in `burgee@1.7.2` by Version PR #1253, re-read on the tarball 2026-10-26, `D-20261026-shipped-on-published-patch`) | y | P | burgee/parse + seniority | 11 | 11 | – | n | – | V2 env on `inputSchema`; K3 discovery order in `config explain` and `--explain`; Stryker 100% on changed lines |
| commander-front-end-diet | **shipped** (batch 3) | y | SHIPPED | burgee/commander-facade + weight | 4 | 4 | – | n | – | Batch 3: `lighter-than-commander` 1.565 → 1.42 (D-20261019-lighter-than-commander-ratchet); `OVER_INCUMBENT` 55,661 → 55,653 (v14 55,997 → 56,002 for #1139's unrecorded +5 B) |
| commander-schema | **dropped** (batch 28, `D-20261025-commander-schema-dropped`) | y | DROPPED | burgee/types + parse | 10 | 3 (+5 partial) | – | n | – | **SUPERSEDED-CANDIDATE** for its positional half → typed-positionals; restate the rest |
| compat-grader-layer | **dropped** (batch 0, `D-20261018-drop-compat-grader-layer`) | n | DROPPED | compat-oracle | 6 | 1 | – | n | – | Ruling: trigger fixed; conflicts with compat-oracle being internal |
| compat-oracle | approved | y | P | compat-oracle | 13 | 12 | R1 (60 s warm budget, not gated) | n | – | Restate R1 or add a timing check. The README compat rows are hand-written |
| completion-context | **shipped** (burgee 1.7.0, Version PR #1231, 2026-10-25) | y | SHIPPED | burgee/completions (execute lane) | 5 | 5 | – | n | **context.qnt** | #1216. Re-grounded on `24d8d8b5`; 229 / 229 mutants detected; four shells on CI (run 40220698351) |
| control-band-agent-schema-bytes | **dropped** (batch 0, `D-20261018-drop-control-band-agent-schema-bytes`) | n | DROPPED | benchmarks/bands | 2 | 2 | – | n | – | Recovered (flat 4,752 B). Cite D-20261012 step-change |
| control-band-cold-start-ratio | **dropped** (batch 0, `D-20261018-drop-control-band-cold-start-ratio`) | n | DROPPED | benchmarks/bands | 2 | 1 | – | n | – | Recovered (1.08), never attributed |
| control-band-commander-front-end-bundled-bytes | **dropped** (batch 0, `D-20261018-drop-band-commander-front-end-bytes`) | n | DROPPED | benchmarks/bands | 2 | 2 | – | n | – | Recovered (55,346) |
| control-band-core-bundled-bytes | **dropped** (batch 0, `D-20261018-drop-control-band-core-bundled-bytes`) | n | DROPPED | benchmarks/bands | 2 | 2 | – | n | – | Recovered (24,281) |
| control-band-yargs-front-end-bundled-bytes | **dropped** (batch 0, `D-20261018-drop-band-yargs-front-end-bytes`) | n | DROPPED | benchmarks/bands | 2 | 2 | – | n | – | Original breach gone; new +31 B 1σ drift does not gate |
| controlroom | approved (umbrella sweep 2026-10-26) | y | P | controlroom | 31 | 22 | C1 Gallery + 20 runs, C2 `ci`/`accessible`, C3 100 runs + Ink screen fixture, C4 PTY restore matrix, C6 fixture, C7 W3 demo pair, C8 `logTail`/`tabBar` through `flagstaff check`; spec R16 controlroom-side lock, R22 per-boilerplate PTY job | **y** | save-restore, registry (parts) | C5 (ink 1,304 / 1,304) and C9 (composition `awaiting` = controlroom only) held; `examples/dashboard` is the reference demo |
| controlroom-scroll-pane | **shipped** (batch 4, PR #1156) | y | NS | controlroom | 10 | 0 | R1–R6, S1–S4 | n (property test) | – | Fixed: a pane scrolls, follows its tail, and the static frame prints every line. Mutation 180 / 180 on the changed lines |
| declaration-summaries | **shipped** (patch, Version PR #1184, 2026-10-20) | y | SHIPPED | published artifacts / build scripts | 4 | 4 | – | n | – (property test) | R1 measured burgee −5.7% gzipped, past the 5% kill switch; R2–R4 built 2026-10-20 |
| default-command | **shipped** (burgee 1.7.0, Version PR #1231, 2026-10-25) | y | SHIPPED | burgee/parse | 5 | 5 | – | n | – | Adoption barrier (commander `isDefault`, yargs `$0`). #1215; `default-command.test.ts` 29 / 29; re-read on burgee 1.7.1 from npm |
| dev-loop | **shipped** (batch 29, #1252) | y | SHIPPED | burgee/dev | 6 | 6 | – | **y** | **dev-reload.qnt** | W4 byte-identity and W6 through the real watcher (74–100 ms local, budget 500 ms); tests only |
| docs-deploy | **dropped** (batch 0, `D-20261018-drop-docs-deploy`) | y | DROPPED | docs-site | 10 | 7 | – | n | – | Ruling: folded into docs-per-package |
| docs-per-package | **shipped** (batch 17, 2026-10-26) | y | SHIPPED | docs-site | 23 | 23 | – | n | – | Takes docs-deploy's R1–R6. Batch 17 added only locks: C8 per row via the real preflight step; R2, R4/R5, R7, R10 each proven red by a mutation. Criterion 7 read live on all ten hosts |
| eslint-plugin-cli-floor | **dropped** (batch 0, `D-20261018-drop-eslint-plugin-cli-floor`) | y | DROPPED | eslint repo | 9 | 0 | – | n | – | Ruling: lives in eslint#1137 |
| extra-typings-drop-in | **shipped** (batch 0) | y | SHIPPED | burgee/types | 5 | 5 | – | n | – | U5 fails (55,661 vs 39,329 B), accepted by decision |
| facade-gets-more | **shipped** (batch 0) | **design.md** | SHIPPED | burgee/commander-facade | 6 | 6 | – | n | – | Rename `design.md` to `spec.md` so it can be approved. Its yargs numbers are stale (804, not 816) |
| facade-projection-fidelity | **shipped** (batch 3) | y | SHIPPED | burgee/yargs-facade | 6 | 6 | – | n | – | Batch 3: R4 built; `burgee/yargs` +424 B bundled (108,850 ceiling) and +852 B walked (221,700), recorded in D-20261019-yargs-facade-relations-bytes; still 0.974× yargs |
| first-adopter | approved (batch 28, `D-20261025-first-adopter-design-accepted`) | y | NS | adoption/outreach | 5 | 0 | A3 revert-first on a fork, one disclosed PR + A2 report; A1/A6 wait on an outside merge | n | – | The spec still names `commander-agent` and needs a rewrite. Barrier 5 (trust) |
| first-cli | **shipped** (polish batch, 2026-10-26) | y | SHIPPED | burgee/init | 5 | 5 | – | n | – | Criterion 1 restated with the install step; criterion 2 restated to the two new `init.test.ts` cases that run `--schema` and `--mcp` on the generated program. Both met from npm on burgee 1.7.1 |
| fix-lines-every-shell | review | y | NS | burgee core (failure.ts) | 7 | 0 | R1–R4, S1–S3 | n | – | **LIVE DEFECT:** `fix:` lines are POSIX-quoted on Windows. Exclude `completions.ts` from R2's grep |
| flagstaff | approved (umbrella sweep 2026-10-26) | y | P | flagstaff | 23 | 19 | C7 U9 eval (no executed run since 2026-10-09; next Saturday 2026-10-31), C8 one case per plugin surface (caique does not depend on flagstaff) | **y** | **save-restore.qnt** | C1–C3 held where their checks live ([D-20261026-flagstaff-criteria-homes](../decisions/D-20261026-flagstaff-criteria-homes.md)); C4–C6 held |
| foundation-claims-watched | **shipped** (fingerprint PR, 2026-10-26, `D-20261026-fingerprint-missing-not-rerecord`) | y | SHIPPED | benchmarks + CI | 11 | 11 | – | n | – (no new state; `--missing` filters an existing write) | S3 restated: the scheduled pass is read-only and never fingerprints. R7 locks every declared competitor to a fingerprint; `--fingerprint --missing` recorded 29 on 2026-10-26, leaving inquirer #1195 and @inquirer/prompts #1224 held |
| frames-fit-the-screen | **shipped** (batch 0) | y | SHIPPED | flagstaff + caique | 8 | 8 | – | n | – | R2 text (`rows-1`/`rows-2`) disagrees with the build. Correct the text before stamping |
| graded-override-targets | approved | y | P | compat-oracle (+migrate test) | 9 | 8 | SC3 (no migrate fixture importing all six) | n | – | Prior reconciliation was wrong here. One test |
| inquirer-prompts-drop-in | **shipped** (caique 1.5.0, Version PR #1237, 2026-10-25) | y | SHIPPED | caique + compat-oracle | 9 | 9 | – | **y** (search's source race) | **search.qnt** | Barrier 10. 213 / 213 (run 40180212984); R1 restated (the pagination suite is select's); budgets in D-20261020-caique-inquirer-prompts-budget |
| linegauge | approved (umbrella sweep 2026-10-26) | y | P (spec edits) | linegauge | 18 | 16 | criterion 2 spawn half: no `perf` row ([D-20261026-library-spawn-delta-rows](../decisions/D-20261026-library-spawn-delta-rows.md)); spec R9 now reads Not built | n | – | R4 (rounds inward) and R13 (`widths` key) restated to the package ([D-20261026-linegauge-r4-r13-restated](../decisions/D-20261026-linegauge-r4-r13-restated.md)). Closes with one perf row, no release |
| locale-pack-in-five | **shipped** (polish batch, 2026-10-26, `D-20261026-locale-criterion-3-median-range`) | y | SHIPPED | burgee check + evals | 6 | 6 | – | n | – | Criterion 3 restated to median and range over a named window, with a 1-in-4 band on burgee calls: 16 readings, median 6, range 5–8, 2 of 16. Both causes removed from the schema (R3a) |
| localised-human-surfaces | approved (re-grounded, batch 24) | y | **LS** | i18n (burgee + caique) | 11 | 11 | – (S4 restated, D-20261020-locale-eval-criterion-restated; 34 / 34 PR readings) | n (decided, same decision) | – | `shipped` after the 2026-10-22 scheduled run passes the case and the minor publishes |
| mcp-current | **shipped** (batch 0) | y | SHIPPED | burgee/mcp | 7 | 7 | – | **y** (in-flight map, cancel vs settle, exactly-once exit) | **none** | Recommend `.sdlc/models/mcp-inflight.qnt` before stamping |
| migrate-dynamic-specifiers | **shipped** (burgee 1.7.0, Version PR #1231, 2026-10-25) | y | SHIPPED | burgee/migrate | 7 | 7 | – | n | – | Barrier 9. #1172; postcss-cli `complete` with burgee 1.7.1 |
| migrate-older-majors | **shipped** (burgee 1.7.0, Version PR #1231, 2026-10-25) | y | SHIPPED | burgee/migrate | 8 | 8 | – | n | **majors.qnt** | **Barrier 1.** #1176; every `manual`-arm crash named in the field re-run |
| migrate-pins-carry-the-drop-in | approved (#1124, beside batch 0) | **n** | SPEC — **IN-PROGRESS** | burgee/migrate | 2 | 0 | S1, S2 | n | – | **LIVE DEFECT** (svgo: `ERR_PACKAGE_PATH_NOT_EXPORTED`). Batch 1, local agent |
| migrate-preflight | **shipped** (burgee 1.7.0, Version PR #1231, 2026-10-25) | y | SHIPPED | burgee/migrate | 10 | 10 | – | n | – | Barriers 2, 3 and 8. #1168; re-run with burgee 1.7.1 on the trial clones |
| migrate-release-age | approved | y | P | burgee/migrate | 6 | 5 | R3 (no `a \|\| b` exclude case) | n | – | One test. Cite pins-carry-the-drop-in as R1's within-major gap |
| output-stack-compat | **dropped** (batch 28, `D-20261025-output-stack-compat-dropped`) | y | DROPPED | compat-oracle | 8 | 4 (+3 partial) | – | n | – | The spec was never accepted. Decide on the drawing bucket |
| output-stack-research | **dropped** (batch 28, `D-20261025-output-stack-research-dropped`) | y | DROPPED | docs-only | 10 | 0 automated | – | n | – | Doc edits only |
| paratext | **shipped** (batch 0) | y | SHIPPED | paratext | 20 | 20 | – | n | – | R11 is a 1.65× ratchet, heavier than ansi-escapes. The owner calls whether that is acceptable as product |
| parse-refusals | **shipped** (batch 0) | y | SHIPPED | burgee/parse | 5 | 5 | – | n | – | R4 shipped as `fix`, not `next[]`; say so in the header |
| plugin-contract | approved (design accepted 2026-10-25; C1–C3 re-read on the ten published tarballs 2026-10-26) | y | P | burgee check / plugins | 12 | 11 | C4 eval: no executed weekly reading since 2026-10-09; the next run is Saturday 2026-10-31 | n | – | one schema, byte-identical in all ten tarballs; `burgee@1.7.2 check` runs every installed layer's check and refuses a spinner with no `static` |
| positioning | **shipped** (batch 0) | y | SHIPPED | docs-only | 16 | 15 | – (R12 reported by decision) | n | – | |
| previous-majors | **shipped** (2026-10-19; released in burgee 1.7.0, Version PR #1231, 2026-10-25) | y | SHIPPED | compat-oracle + façades + migrate | 6 | 6 | – | n | – | **Barrier 1.** #1086 and #1165; commander-14 1,331 / 1,331, yargs-17 793 / 794 (run 40180212984) |
| release-cadence | approved (#1124; window fixed 2026-10-26, D-20261026-release-window-holds-code) | y | P | release | 9 | 9 | S2: the 30-day share, read over the 30 days after the fix merges (0 of 7.19 days so far) | **y** (`release-window.qnt`, now with the code on main) | all five counterexamples, `holdsVersionsNotCode` and `shippedNeverHoldsAFix` among them, in `models.yml` since D-20261027-close-three-workflow-gaps | #1253 shipped three held minors' code as patches; a held package's fixes now wait with it, and `release.yml` defers such a patch |
| replacement-parser | review | y | P | burgee/parse | 10 | 7 | G3 (quirks subpath; contradicts yargs-compat), G7, SC2 (1.55× ratchet, not ≤1×) | n | – | Restate to D-157 and drop G3 |
| roundel | **shipped** (batch 0) | y | SHIPPED | roundel | 17 | 17 | – | n | – | Rewrite the stale 2026-09-09 verified section |
| schema-bytes-gated | **shipped** (schema-group) | y | SHIPPED | benchmarks reliability | 3 | 3 | – | n | – | Budget 4,650 B (demo 4,628 B at `326907ec`); gap B-20261012 closed |
| schema-is-validated | **shipped** (schema-group) | y | SHIPPED | burgee/schema | 3 | 3 | – | n | – | SC3: the claim is made again and `program-schema.test.ts` holds it |
| sdlc-locks-evals-bands | approved (batch 29 built, #1252; read 2026-10-26) | y | P | sdlc locks | 10 | 9 | S3: `test-duration-ms` still at 7 points. Run 40311991676 named why (the job never builds the demo `mcp-config-block.test.ts` starts) and hit its 20-minute limit, so no band gained a point: B-20261026-control-bands-demo-build-and-budget, fixed by D-20261027-close-three-workflow-gaps; the 2026-11-02 run reads it | n | – | `.sdlc/intents` in evals layer 1, which runs on every PR in `quality.yml`; 0 broken links, 8 planned scripts exempted. A dropped duration point names its cause |
| security-profile | **dropped** (batch 0, `D-20261018-drop-security-profile`) | y | DROPPED | burgee/security | 11 | 0 | – | n | – | Ruling: no adopter; exit-code clash |
| seniority | approved (umbrella sweep 2026-10-26) | y | P | seniority | 21 | 13 | criterion 4: the spawn and discovery-chain rows are gated on main but not on `/docs/benchmarks` (published measurement is 2026-10-19) | n | – | `packageLayer` (R3) is already in the seniority 1.1.1 tarball, so the held minor no longer gates it. Closes with a new published bench measurement, no release |
| supports-color-drop-in | **shipped** (roundel 1.2.0, 2026-10-20) | y | SHIPPED | roundel + compat-oracle | 9 | 9 | – | n | – | 441.6 M/wk with no override target |
| table-column-widths | **shipped** (batch 0) | y | SHIPPED | flagstaff | 7 | 7 | – | n | – | |
| typed-positionals | shipped (R4 built #1262; published in `burgee@1.7.2` by Version PR #1253, re-read on the tarball 2026-10-26, `D-20261026-shipped-on-published-patch`) | y | P | burgee/parse + types | 6 | 6 | – | n | – | R1–R3 shipped in burgee 1.7.0 (#1173); R5 and R6 met (#1091); R4's `type` and `enum` on `inputSchema`, and a positional's choices on TAB in bash, zsh, fish and pwsh, native and façade |
| types-under-node10 | draft | **n** | SPEC | published artifacts (`typesVersions`) | 3 | 0 | SC1–SC3 | n | – | **LIVE DEFECT / barrier 4:** TS2307 on node10 (38.8% of TS dependents) |
| u5-weight-claim | **shipped** (batch 0) | y | SHIPPED | benchmarks (weight) | 3 | 3 | – | n | – | Reads 0.97 in CI; trim the stale Verification paragraph |
| upstream-watch | **shipped** (batch 0) | y | SHIPPED | compat-oracle + CI | 8 | 8 | – | n | – | R5 and R7 are held by workflow config; cite those lines. Dedupe only searches open issues |
| vendor-resolves-its-own-tree | approved | y | P | compat-oracle | 3 | 2 | R3 (no real run without `node_modules`) | n | – | The spec's verify command has the wrong `--root` |
| windows-lane-holds | approved (R1–R5 in #1135; R3d 2026-10-26) | y | P | workflows/CI + tests | 6 | 6 | criterion 2: the half-budget check named a case in 5 of 71 full Windows cells; closes after ten consecutive cells name none | n | – | Criteria 1, 3, 4 met on `main`'s cells: 13 green in a row (2026-10-20), the pwsh case median 4.7 s over ten. The cold start moved to the phases case, where `lookup` took 52–65 s: R3d |
| yargs-compat | **shipped** (batch 0) | y | SHIPPED | burgee/yargs-facade | 8 | 8 | – | n | – | The stamped numbers should be 816/816 against 18.2.0 |

### Quint coverage summary

These intents need a model:

| intent | model status |
| :-- | :-- |
| closeout | covered by `registry.qnt` |
| flagstaff | covered by `save-restore.qnt` |
| caique | covered by `prompt-session.qnt` and `save-restore.qnt` |
| dev-loop | covered by `dev-reload.qnt` |
| burgee | covered by its children |
| agent-lint-conformance | partial: `registry.qnt` covers closeout's deadline, not the engine timer |
| controlroom | partial: no controlroom model of its own |
| mcp-current | missing (in-flight cancel) |
| bellpull | missing (kill ladder) |
| closeout-at-incumbent-weight | `lean.qnt`, built 2026-10-20 |
| completion-context | `context.qnt`, built 2026-10-20 |
| release-cadence | missing (release window) |

`release-tag.qnt` exists but is not an intent's model of record; it covers tag placement.

## (b) Check commands for the LIKELY-SHIPPABLE intents

**Before running anything:**
- Build first with `npx turbo run build --concurrency=4`. Several tests read `dist/`, and so does `npm run compat`.
- Compat commands are run as `npm run compat -- <host>`, or as `node packages/compat-oracle/dist/bin.js <host>`.

**After the checks are green**, set the header to the shipped format:
`**Status:** shipped · **Shipped:** <date> on <sha>, verified against main at <sha> — all N criteria locked by <files>`.

**Owner accept needed first.** These six are not yet `approved`:
- At `review`, so they need the Design→Build accept first: commander-completions, yargs-compat, facade-gets-more and u5-weight-claim.
- At `draft`: burgee-migrate.
- Has no `spec.md`: facade-gets-more needs `design.md` renamed to `spec.md` first.

### parse-refusals
```
npx --no vitest run --root packages/burgee src/parse-refusals.test.ts src/schema.test.ts src/stdin-dash.test.ts
npx --no vitest run --root packages/burgee src/json-failure.test.ts -t "parse-refusals R4"
npm run compat -- commander yargs
```
### yargs-compat (review → accept first)
```
npm run compat -- yargs
npm run compat -- yargs --control
npx --no vitest run --root packages/burgee src/weight.test.ts src/yargs/burgee.test.ts
npx --no vitest run --root examples/conformance src/yargs-parity.test.ts
```
### extra-typings-drop-in
```
npx --no vitest run --root packages/compat-oracle src/run.test.ts -t "tsd runner"
npm run compat -- extra-typings
npm run compat -- extra-typings --control
npx --no vitest run --root packages/burgee src/compat-baseline-lock.test.ts src/migrate.test.ts
npx --no vitest run --root packages/burgee src/facade-types.test.ts -t "extra-typings-drop-in R4"
npx --no vitest run --config vitest.root.config.ts scripts/drop-in-type-surface-lock.test.ts scripts/drop-in-require-shape-lock.test.ts scripts/migrate-drop-ins-lock.test.ts scripts/subpath-weight-lock.test.ts
```
### facade-gets-more (rename design.md → spec.md, then accept)
```
npx --no vitest run --root packages/burgee src/facade-surface.test.ts src/mcp.test.ts src/weight.test.ts
npm run compat -- commander
npm run compat -- yargs
```
### commander-completions (review → accept the two restatements)
```
npx --no vitest run --root packages/burgee src/completions.test.ts src/completions-edges.test.ts src/completion-flags.test.ts src/completions-dynamic.test.ts src/fig-schema.test.ts src/fig-spec.test.ts src/commander/surfaces.test.ts
gh run list --workflow completions.yml --branch main --limit 3   # pwsh, zsh and fish only run in CI
```
### burgee-migrate (draft → approved → shipped)
```
npx --no vitest run --root packages/burgee src/migrate.test.ts src/migrate-demo.test.ts src/migrate-cli.test.ts src/migrate-bench.test.ts src/compat-baseline-lock.test.ts src/facade-types.test.ts
npx --no vitest run --config vitest.root.config.ts scripts/migrate-drop-ins-lock.test.ts scripts/exit-code-lock.test.ts
npx --no vitest run --root examples/conformance src/harness.test.ts
```
### upstream-watch
```
npx --no vitest run --config vitest.root.config.ts scripts/competitors-lock.test.ts
npx --no vitest run --root packages/compat-oracle src/registry.test.ts src/issue.test.ts src/watch.test.ts src/competitors.test.ts src/upstream.test.ts
gh run list --workflow compat-upstream.yml --limit 10
```
### agent-surface-declared (fix the `effects.test.ts` citation in the spec first)
```
npx --no vitest run --root packages/burgee src/mcp.test.ts -t "a runnable command declares its effects, or declines out loud"
npx --no vitest run --root packages/burgee src/mcp.test.ts -t "lists exactly the commands the author did not withhold"
npx --no vitest run --root packages/burgee src/facade-surface.test.ts -t "G1/G2"
npx --no vitest run --root packages/burgee src/yargs/burgee.test.ts
npm run compat -- commander yargs
```
### mcp-current (recommend `mcp-inflight.qnt` and a models.yml path entry first)
```
npx --no vitest run --root packages/burgee src/mcp.test.ts -t "R1|R2|R3"
npx --no vitest run --root packages/burgee src/mcp-transport.test.ts -t "a call in flight"
npx --no vitest run --root packages/burgee src/mcp-config.test.ts
npx --no vitest run --root packages/flagstaff src/progress.test.ts
npx --no vitest run --config vitest.root.config.ts scripts/mcp-messages.test.ts scripts/mcp-config-block.test.ts
```
### clispec-conformance (fix the C1 path in the intent)
```
npx --no vitest run --config vitest.root.config.ts scripts/clispec-document.test.ts scripts/program-schema.test.ts scripts/decisions-lock.test.ts
npx --no vitest run --root packages/burgee src/schema.test.ts -t "R1 —|R3 —|R4 —"
npx --no vitest run --root packages/burgee src/exit-code.test.ts -t "every exit code has a kind"
npx --no vitest run --root packages/burgee src/define-error.test.ts -t "R2"
npx --no vitest run --root packages/burgee src/schema-fields.test.ts -t "declared output"
npx --no vitest run --root packages/burgee src/facade-types.test.ts -t "declared output schema types the handler"
npx --no vitest run --root packages/burgee src/definition.test.ts -t "R5"
npx --no vitest run --root packages/burgee src/json-failure.test.ts -t "R6"
npx --no vitest run --root packages/burgee src/machine-json.test.ts -t "format text is the human rendering"
npx --no vitest run --root benchmarks floor.test.ts
npx --no vitest run --root apps/docs tests/examples.test.ts
npm run compat -- commander yargs
```
### positioning
```
npx --no vitest run --config vitest.root.config.ts scripts/positioning-lock.test.ts scripts/agent-page-lock.test.ts scripts/readme-opening-lock.test.ts scripts/vercel-apps-lock.test.ts scripts/api-reference-lock.test.ts scripts/install-graph-lock.test.ts
npx tsx scripts/positioning-audit.ts
```
### roundel (rewrite the stale verified section)
```
npx --no vitest run --root packages/roundel src/policy.test.ts src/tokens.test.ts src/theme.test.ts src/contrast.test.ts src/chalk.test.ts src/subpath-isolation.test.ts src/weight.test.ts src/shape.test.ts src/import.test.ts src/terminal.test.ts
npx --no vitest run --root packages/burgee src/process-reference-lock.test.ts src/help.test.ts -t "theme seam"
npx --no vitest run --config vitest.root.config.ts scripts/roundel-gallery.test.ts scripts/tree-shake-fixture.test.ts
npx --no vitest run --root benchmarks ratchet.test.ts -t "B2 cold start"
npm run compat -- chalk
npm run bench:page -- --check
```
### caique-quiet-seam (restate R2's progress/taskLog per D-152)
```
npx --no vitest run --root packages/caique src/clack-quiet.test.ts
npx --no vitest run --config vitest.root.config.ts scripts/sync-package-docs.test.ts scripts/subpath-weight-lock.test.ts
npm run compat -- clack
```
### table-column-widths
```
npx --no vitest run --root packages/flagstaff src/table.test.ts src/weight.test.ts
npm run compat -- cli-table3
```
### frames-fit-the-screen (correct R2's text to match the build first)
```
npx --no vitest run --root packages/flagstaff src/projection.test.ts -t "a live frame never outgrows the terminal"
npx --no vitest run --root packages/caique src/raw.test.ts -t "a list prompt never outgrows the terminal"
npx --no vitest run --root packages/flagstaff src/weight.test.ts
npx --no vitest run --root packages/caique src/weight.test.ts
npm run compat -- ora log-update clack
```
### paratext (owner accepts the 1.65× ratchet as product)
```
npx --no vitest run --root packages/paratext
npx --no vitest run --root packages/flagstaff src/link.test.ts src/table.test.ts
npx --no vitest run --root packages/burgee src/process-reference-lock.test.ts
npx --no vitest run --config vitest.root.config.ts scripts/plugin-schema-lock.test.ts scripts/plugin-schema-agreement.test.ts scripts/foundation-ceilings-lock.test.ts scripts/intent-artifacts-lock.test.ts scripts/package-shape-lock.test.ts scripts/competitors-lock.test.ts
npm run compat -- ansi-escapes terminal-link term-img --control
npm run compat -- ansi-escapes terminal-link term-img
npm run bench -- --axis weight --check
```
### localised-human-surfaces (needs one real eval run; paid, so quote the cost)
```
npx --no vitest run --root packages/burgee src/locale.test.ts src/locale-invariance.test.ts src/messages.test.ts src/check.test.ts src/plugin.test.ts
npx --no vitest run --root packages/burgee src/help.test.ts -t "a localised description renders in the resolved locale"
npx --no vitest run --root packages/burgee src/schema.test.ts -t "carries the base language of a localised description"
npx --no vitest run --root packages/caique src/locale.test.ts src/messages.test.ts
npx --no vitest run --config vitest.root.config.ts scripts/locale-pack-schema-lock.test.ts
npm run compat -- clack inquirer-core
gh run list --workflow evals.yml --limit 3   # need a run that executed and passed locale-pack-from-schema
```
### u5-weight-claim (review → accept; trim the stale Verification paragraph)
```
npx --no vitest run --root benchmarks ratchet.test.ts -t "ratio gate"
npx --no vitest run --config vitest.root.config.ts scripts/subpath-weight-lock.test.ts -t "U5"
npx --no vitest run --config vitest.root.config.ts scripts/claim-table-lock.test.ts
npm run bench -- --axis weight --check
npm run bench:page -- --check
```

**Batch 0 is done (2026-10-18).** It shipped 17 of the 18 and held `localised-human-surfaces` at
`approved`, because it has no executed weekly eval. It also applied the 9 drops and fixed every
citation below except linegauge's. linegauge was taken out of Batch 0 by the coordinator and moves
to batch 15. Two items were added on the way:

- `D-20261018-paratext-ratio-held-ratchet`, which accepts R11's 1.65× as a held ratchet.
- Gap `A-20261018-dropped-band-intent-masks-breach`: a dropped `control-band-*` directory blocks
  the watcher's `wx` write, so a new breach of that band writes nothing.
- `D-20261019-b1-weekly-not-per-push`: the paid B1 job in `bench.yml` runs weekly, on dispatch and
  on a `bench:agent` PR, and no longer on every push to `main`. Per-push runs used up the Claude
  quota that the required `review` check also draws on. The bound is held by
  `benchmarks/ci-axes.test.ts`.

As planned, Batch 0 was to do three things:
- It flips the 18 headers above once their checks are green, in lane groups.
- It applies the 9 DROP headers.
- It fixes the citations named in the notes:
  - effects.test.ts (agent-surface-declared)
  - the clispec C1 path
  - frames R2 text
  - caique-quiet R2
  - linegauge R4/R13
  - the roundel verified section

  The linegauge fix moves it to shippable as well.

## (c) Proposed batches (one PR each)

The order follows the brief:
- Live defects come first.
- Then adoption barriers, in the order of `adoption-barriers-2026-10.md` §"order of work".
- Then the order of `next-wave-4-2026-10.md`, with `declaration-summaries` early.
- Then the rest.

A draft gets "write spec" inside its batch. The two-local-agents cap means at most two batches
run in parallel, and only when they touch no common file. The lane table in next-wave-4 governs that.

| # | batch | lane | intents | why here / dependencies |
| --: | :-- | :-- | :-- | :-- |
| — | IN PROGRESS | burgee/migrate · release | migrate-pins-carry-the-drop-in (write spec + fix), release-cadence (write spec + lock), mutation-tested (new, Stryker gate) | Batch 1 and 2 of the local agents. Do not touch migrate.ts or the release files until they land |
| 0 | ~~**Status flips + drops**~~ **done 2026-10-18** | docs-only | 17 shipped, `localised-human-surfaces` held at approved, the 9 DROPs, the citation fixes | No code. See the note under (b) |
| 1 | **CI honesty** | workflows/CI + evals | windows-lane-holds (R3 pwsh hang first, then R1–R5) · **new defect: record a never-executed eval as `not-run`** (write intent + spec) · ~~ci-affected-lanes~~ (shipped 2026-10-26, R4 read) · localised-human-surfaces (stamp once a weekly run executes and passes `locale-pack-from-schema`; restate criterion 4's "one turn") · gap `A-20261018-dropped-band-intent-masks-breach` (watcher writes a new intent past a dropped one) | Live defects: the pwsh hang fails unrelated PRs, and the usage-limit run scored as 0/11. Eval-gated criteria in 5 intents wait on it |
| 2 | **Agent-surface defects** | burgee core (failure.ts, help) + floor | fix-lines-every-shell (R1–R4) · agent-lint-conformance (FS-4 regression, R7 ratchet) · agent-skill (C4 SD-5 via the same CI floor reading) | Live defects: Windows `fix:` lines break, and FS-4 regressed. One published CI floor reading closes two intents |
| 3 | **Façade fidelity and weight** | burgee/façades + weight ratchets | facade-projection-fidelity (R4 yargs conflicts, implies, example; byte decision) · commander-compat (X6 budget re-measure) · commander-front-end-diet (R4 ratchet 1.565→1.42) | Live defect: yargs relations are silently missing from `--schema` and MCP |
| 4 | **controlroom** | controlroom | controlroom-scroll-pane (R1–R6) · controlroom (gallery S1, R16 lock, stale "reserved" text, `#PR_NUMBER`s, add a controlroom Quint model) | Live defect: pane rows are unreachable. frames-fit-the-screen ships in batch 0, which unblocks it |
| 5 | **Older majors, graded** | compat-oracle + façades | previous-majors (rebase and land #1086, then yargs 17 R3–R5) · compat-oracle (R1 restate or gate) · vendor-resolves-its-own-tree (R3 real no-`node_modules` run) | Barrier 1 (2.51, then 1.70). Must precede migrate-older-majors |
| 6 | **migrate tells the truth** | burgee/migrate | migrate-older-majors (**write spec**) · migrate-preflight (**write spec**) · migrate-dynamic-specifiers (**write spec**) · migrate-release-age (R3 `a \|\| b` test) · graded-override-targets (SC3 fixture importing all six) | Barriers 1, 2, 3, 8 and 9. Starts after migrate-pins lands (same file) and after batch 5 |
| 7 | **Published types and bytes** | published artifacts / packaging | types-under-node10 (**write spec**, `typesVersions`) · declaration-summaries (R1–R4) · cli-packaging (R4 `.map` fixture) | Barrier 4 (the cheapest fix) plus wave-4 #2, early. All touch the artifact scripts |
| 8 | **First users** | burgee/init + outreach | first-cli (rebase and land #1092, Design→Build accept) · first-adopter (rewrite spec off commander-agent) · caller-matrix (**write spec**) | Barrier 5 (trust) |
| 9 | **Drop-ins in the compat-oracle lane** | caique/roundel + compat-oracle | inquirer-prompts-drop-in (R3 seven prompts, R4, R5) → supports-color-drop-in → colour-facades | Barrier 10, then wave-4 #6, in the order the lane rule fixes. Can split into 2 PRs |
| 10 | **closeout at incumbent weight** | closeout + weight ratchets | closeout-at-incumbent-weight (`lean.qnt` first, R1–R5) · closeout (S3 closes with it; refresh the stale section) | Wave-4 #1. Add closeout's new files to models.yml `paths:` |
| 11 | **Benchmark gates and readings** | benchmarks | schema-bytes-gated (R1–R3) · b1-mcp-arm (R5 page, investigate the missing weekly reading) · cli-benchmarks (B7, R6, R8, claim decision) · ~~foundation-claims-watched~~ (shipped 2026-10-26, fingerprint PR) | Wave-4 #3 |
| 12 | **burgee check + locale** | burgee check + evals | locale-pack-in-five (R1–R3; paid runs, quote the cost) · plugin-contract (R7 restate, C3 check beyond burgee, status table) | Wave-4 #5. Both edit check.ts. Needs batch 1's eval fix |
| 13 | **Parse and dispatch** | burgee/parse | completion-context (R1–R4) → default-command (R1–R5) → typed-positionals (R1–R4) · commander-schema (restate; positional half moves to typed-positionals) | Wave-4 #8 and #11, in the wave-3 lane order |
| 14 | **Output stack close-out** | flagstaff/caique (umbrella) | flagstaff (S1–S3 restate, S8, the `Â·` test names) · caique (R1 `promptFor`, S2, S3) · cli-output-stack (map rows to children) · output-stack-compat (drawing-bucket decision) · output-stack-research (caique evidence table) | Rest |
| 15 | **Foundation close-out** | linegauge/seniority/bellpull | linegauge (spec edits: R4 rounding direction, R13 `widths` plugin; moved here from batch 0) · seniority (truth-table page, shared vectors, R7, R9) · bellpull (**Quint model for the kill ladder**; S1, S4 and S5 closed, shipped 2026-10-27) · cli-foundation-stack (restate drift, close via children) | Rest |
| 16 | **MCP and agent output** | burgee/mcp + agent-surface | `.sdlc/models/mcp-inflight.qnt` for shipped mcp-current (cancel vs settle, exactly-once exit; add its sources to `models.yml` `paths:`) · cli-mcp (drop the lint rule after the eslint move, C4 after batch 11) · agent-headroom (restate against N13/N14; R3, R5, RF) | Rest |
| 17 | **Docs and SDLC locks** | docs-site + sdlc locks | ~~docs-per-package (C8 per row, R2, R7, R10 locks; absorbs docs-deploy)~~ **shipped 2026-10-26** (also R4/R5) · sdlc-locks-evals-bands (`.sdlc/intents` into the link checker and evals paths) · schema-is-validated (R3 lock) · brand-burgee (**write spec**) | Rest |
| 18 | **burgee umbrella restatements** | burgee (umbrella) | burgee (Z4 15-line lock, Z5, F3/O3/P1 restated after the eslint drop, criteria 3–5) · commander-env (restate) · replacement-parser (drop G3, restate SC2/G7 to D-157) | Rest; mostly text |
| 19 | **Help, harness, dev loop** | burgee/help + testing + dev | cli-help-renderer (S1 min/max, S3 restate) · cli-testing-harness (ANSI case, S2/S4 restate) · dev-loop (W2, W3, W4, W6 tests; dev-reload.qnt exists) | Rest |
| 20 | **Native engine (last)** | burgee + release pipeline | native-engine (**opened 2026-10-20, owner prompt**; starts only after every other intent has closed: measure `migrate`, the CI type-check lane on tsrs, single-binary distribution and the core parser, JS against a native prototype; port only what wins, shipped the oxc way behind an opt-in, size-ratcheted package) | After all others |

Coverage: each of the 63 intents still open after Batch 0 (the original 62, plus `localised-human-surfaces`, which Batch 0 held at `approved`) is in exactly one batch or in the in-progress row.

**Batch 28 — design gates, 2026-10-25 (docs only).** Every intent waiting at a gate went through
it, except `native-engine` (draft by the owner's order). Each ruling is one decision file.

- **Approved, with a scoped build:** `agent-headroom`, `cli-benchmarks`, `commander-env`,
  `dev-loop`, `first-adopter`, `sdlc-locks-evals-bands`, `caller-matrix`, `burgee` (umbrella)
  and `cli-foundation-stack` (umbrella). Each scope is in the row above and in the intent's
  `spec.md` § Design gate 2026-10-25.
- **Approved with nothing to build:** `cli-mcp`. It ships when `b1-mcp-arm` lands.
- **Dropped:** `output-stack-compat`, `output-stack-research`, `brand-burgee` and
  `commander-schema`. Gap `B-20261019-commander-schema-remaining` is closed.

Batches 8, 11, 14, 16, 17, 18 and 19 named some of these intents as "write spec", "restate" or
"decide". Those items are done here. What remains in those batches is the build scope each row
now names.

**Batch 29 — the locks and tests, 2026-10-25 (#1252).** The six designs whose build was tests,
locks, docs or CI were built in one PR. The rulings are in
[`D-20261025-batch29-locks-tests-rulings`](../decisions/D-20261025-batch29-locks-tests-rulings.md).

- **Stamped `shipped`:** `dev-loop`. Its two new checks are tests, and there is nothing to
  publish.
- **Built, held for the Version PR:** `cli-foundation-stack`, `cli-benchmarks` and
  `commander-env`. Every criterion holds on merged code. Package READMEs and one `burgee` minor
  reach npm only when the next Version PR publishes, and that is when they ship.
- **Built, one criterion open:** `caller-matrix` (5 missing cells) and `sdlc-locks-evals-bands`
  (the duration band has not gained a point; the next weekly run names why).

**Caller matrix and the umbrella's own build, 2026-10-26 (`test/caller-matrix-and-umbrella`).**
Tests, locks and a benchmark; no package source changed, so nothing waits on a release.

- **Stamped `shipped`:** `caller-matrix`. The five `missing` cells each got a test, the ceiling
  fell to 0, and `/docs/callers` reads 48 held, 7 n/a.
- **Built, still `approved`:** `burgee` (umbrella). Z5's 250-command bench is in the `perf`
  axis (250 ÷ 30 at about 1.0×, gate 3×,
  [`D-20261026-scale-bench-gate`](../decisions/D-20261026-scale-bench-gate.md)) and criterion 4
  is a ratchet at 50 disabled rules
  ([`D-20261026-disabled-rule-ceiling`](../decisions/D-20261026-disabled-rule-ceiling.md)). It
  closes when its open children do.

**Umbrella sweep, 2026-10-26 (docs only).** The eight package umbrellas were re-read criterion by
criterion against `main` at `3d079b15` and against their published tarballs (`npm view` agrees
with every manifest). None is stamped. Each now carries a § Umbrella sweep 2026-10-26 with its
exact closing list, and the rows above are updated. Decisions:
[`D-20261026-linegauge-r4-r13-restated`](../decisions/D-20261026-linegauge-r4-r13-restated.md),
[`D-20261026-library-spawn-delta-rows`](../decisions/D-20261026-library-spawn-delta-rows.md),
[`D-20261026-bellpull-kill-gate-reading`](../decisions/D-20261026-bellpull-kill-gate-reading.md),
[`D-20261026-flagstaff-criteria-homes`](../decisions/D-20261026-flagstaff-criteria-homes.md).

- **No release needed:** `linegauge` (a spawn row), `closeout` (a spawn row and a new published
  bench measurement), `seniority` (that measurement), `bellpull` (spawn sites moved onto it; done and stamped
  `shipped` 2026-10-27, D-20261027-bellpull-dogfood-spawn).
- **Build plus a release:** `caique`, `flagstaff` (criterion 8), `controlroom`.
- **Measurement:** `flagstaff` criterion 7, read on the 2026-10-31 eval run (Saturdays since D-20261027-close-three-workflow-gaps).
- **`burgee`:** closes when its children do. The grouped list is in its intent.
- **Release finding:** Version PR #1253's patches were built from a `main` that already carried
  every held minor's code (`burgee/dist/formats.js`, `check.js`'s `layers`, the colorette and
  kleur rewrites, roundel's `./colorette`, `./kleur` and `./yoctocolors`, seniority's
  `packageLayer`). The release window holds the version number, not the code.

**Published-patch stamps, 2026-10-26 (`docs/stamp-published-features`).** Version PR #1253
published patches built from a `main` that already carried the features the release window held
as minors. Each intent waiting only on "the burgee minor" or "the roundel minor" was re-read on the
tarball (`npm i <pkg>@<exact version>` in an empty directory), and the ruling is
[`D-20261026-shipped-on-published-patch`](../decisions/D-20261026-shipped-on-published-patch.md).

- **Stamped `shipped`:** `colour-facades` (`roundel@1.2.1`), `typed-positionals`,
  `agent-headroom` and `commander-env` (`burgee@1.7.2`). Each intent's § Shipped 2026-10-26 has
  the command run against the published package for every criterion.
- **Stamped `shipped` after Version PR #1278:** `cli-output-stack`. Its last open item, R12's
  README opening, is in the `flagstaff@1.7.5` tarball, byte-identical to `main`.
- **Re-read, still `approved`:** `plugin-contract`. C1–C3 hold on all ten tarballs. C4 has no
  executed weekly eval since 2026-10-09; the 2026-10-31 run decides it.
- **Not touched here:** `seniority`, whose wait on the minor ended the same way, but whose
  criterion 4 rows are not on `/docs/benchmarks` (#1280's umbrella sweep records it), and
  `release-cadence`, whose window was breached in substance and which another batch owns.
