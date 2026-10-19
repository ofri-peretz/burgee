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
| agent-headroom | review | y | P | burgee/agent-surface + benchmarks | 10 | 3 | R2 (partial: no `--fields`), R3 `--max-bytes`, R5 ndjson, R6, RF, C1 (asserts 30% not 40%), C4 | n | – | R2 and R4 overlap `burgee` N13/N14; restate to leave R3, R5 and RF |
| agent-lint-conformance | approved | y | P | burgee/agent-surface + floor | 8 | 7 | R7 (ratchet at 91, below the 94.9 reading); FS-4 regression | y (timeout timer vs settle) | registry.qnt (partial) | **LIVE DEFECT:** its own R4 auth row in help broke FS-4 |
| agent-skill | approved | y | P | burgee/agent-surface | 7 | 6 | C4 (the published reading fails SD-5; nothing gates SD-5) | n | – | Same CI floor reading as agent-lint R7 |
| agent-surface-declared | **shipped** (batch 0) | y | SHIPPED | burgee/mcp | 9 | 9 | – | n | – | The spec cites `effects.test.ts`, which is absent; tests are in `mcp.test.ts`. Fix the citation |
| b1-mcp-arm | approved | y | P | benchmarks + CI | 9 | 6 | R5 (no MCP page section), C2 (0/4 weekly readings), C3 | n | – | The 10-13 weekly run left no reading. Investigate, possibly the usage limit |
| bellpull | approved | y | P | bellpull | 17 | 14 | S1 kill-gate re-read, S4 (compat-oracle still uses `child_process`), S5 recipe not executed | **y** (deadline, SIGTERM, SIGKILL ladder) | **none** | The spec header still says "not accepted" |
| brand-burgee | draft | **n** | SPEC | brand | 4 | 1 | C1, C2, C4 partial | n | – | Built before any design; write spec.md |
| burgee | review | y | P | umbrella | 119 | 110 | Z4 (15-line cap), Z5 (250-cmd bench), F3/O3/P1 (eslint-repo; restate), U12 outside adopter, intent C3 (eslint plugin), C4 (disabled rules exist), C5 (non-TTY partial) | partly | registry, prompt-session, dev-reload | Constraint 1 and the agent-detection decision are contradicted by shipped code; record the reversals |
| burgee-migrate | **shipped** (batch 0) | y | SHIPPED | burgee/migrate | 12 | 12 | – | n | – | Stale header: needs draft → approved (owner) → shipped. Verification 3 is indirect |
| caique | approved | y | P | caique | 13 | 10 | R1 `promptFor` API, S2 non-TTY bench, S3 PTY / Windows | **y** | prompt-session, save-restore | |
| caique-quiet-seam | **shipped** (batch 0) | y | SHIPPED | caique | 8 | 8 | – | n | – | Restate R2 (`progress` and `taskLog` were not ported, D-152) |
| caller-matrix | draft | **n** | SPEC | examples/conformance + docs | 4 | 0 (2 partial) | S1–S4 | n | – | S4 is blocked on first-adopter |
| ci-affected-lanes | approved | y | P | workflows/CI | 7 | 5 | R4 / S3 (ci-minutes reading after 20 PRs since #1101) | n | – | Blocked only on time |
| cli-benchmarks | review | y | P | benchmarks | 16 | 11 | B7 link lock, B3/R8 compat-axis test, R6 ≥30 spawns, CLAIM 0.699× | n | – | Header stale ("no bench script"). Owner call on the token claim |
| cli-foundation-stack | draft | y | P | umbrella (foundation) | 17 | 9 | Y2, Y3, Y4, Y8, Y12, S1, S3, S5 | n | – | Drifted: Node floor, and every package ships a bin. Close via children, move S3/S5 to a new intent |
| cli-help-renderer | **shipped** (typed-schema-surface) | y | SHIPPED | burgee/help | 10 | 10 | – | n | – | S1's min/max row held 2026-10-19 |
| cli-mcp | review | y | P | burgee/mcp | 16 | 14 | lint rule (eslint repo, now dropped here; restate), C4 (waits on b1-mcp-arm) | n | – | K1 "deps {}" → restate as "nothing outside the family" |
| cli-output-stack | approved | y | P | umbrella (output stack) | 23 | 17 | R2 env-name lock, R3 examples case, R11 inquirer 100/213, S2 dependency-count row, S5 spinner cases | n | – | Close by mapping each row to roundel, flagstaff or caique |
| cli-packaging | review | y | P | release/packaging | 10 | 8 | R4 / S3 (`.map` negative fixture; `forbiddenInPack` untested) | n | – (release-tag.qnt is tags only) | One test closes it |
| cli-testing-harness | review | y | P | burgee/testing | 11 | 8 | S1 ANSI-in-non-TTY case, S2 and S4 restate | n | – | |
| clispec-conformance | **shipped** (batch 0) | y | SHIPPED | burgee/schema | 10 | 10 | – | n | – | Fix the C1 path (it is `scripts/clispec-document.test.ts`); the 24/24 reading is local, but bench.yml enforces ≥24 |
| closeout | approved | y | P | closeout | 17 | 15 | R8 spawn delta unbenchmarked, S3 (2.98× / 1.31×) | **y** | **registry.qnt** | S3 closes with closeout-at-incumbent-weight. The "disagree" section is stale |
| closeout-at-incumbent-weight | review | y | NS | closeout + weight ratchets | 8 | 2 | R1–R4, S1, S3 | **y** (two doors, one hook set) | **none** (`lean.qnt` required by R4) | Wave-4 #1. Needs the Design→Build accept |
| colour-facades | review | y | NS | roundel + compat-oracle | 8 | 0 | R1–R5, S1–S3 | n | – | Waits on inquirer and supports-color in the compat-oracle lane |
| commander-compat | **shipped** (batch 3) | y | SHIPPED | burgee/commander-facade | 8 | 8 | – | n | – | Batch 3: X6 ratcheted 129,400 → 112,100 on a clean-build reading of 112,024 (D-20261019-commander-walk-budget-ratchet). X5 had no real check (`.`'s denied list never named the front-end), so one was added and proven red |
| commander-completions | **shipped** (batch 0) | y | SHIPPED | burgee/completions | 8 | 8 | – | n | – | Human accepts two restatements: Fig is structural, `complete` replaces `--dynamic`. CI's `completions.yml` is authoritative |
| commander-env | review | y | P | burgee/parse + seniority | 11 | 8 | intent C1 (per-issue case), C3 (`LAYER=off` gone), C4 (synthetic only), R3 façade `--explain` | n | – | Mostly restate; the `withEnv` design is superseded |
| commander-front-end-diet | **shipped** (batch 3) | y | SHIPPED | burgee/commander-facade + weight | 4 | 4 | – | n | – | Batch 3: `lighter-than-commander` 1.565 → 1.42 (D-20261019-lighter-than-commander-ratchet); `OVER_INCUMBENT` 55,661 → 55,653 (v14 55,997 → 56,002 for #1139's unrecorded +5 B) |
| commander-schema | approved (typed-schema-surface) | y | P | burgee/types + parse | 10 | 3 (+5 partial) | C1, R2, R4 (B-20261019-commander-schema-remaining) | n | – | **SUPERSEDED-CANDIDATE** for its positional half → typed-positionals; restate the rest |
| compat-grader-layer | **dropped** (batch 0, `D-20261018-drop-compat-grader-layer`) | n | DROPPED | compat-oracle | 6 | 1 | – | n | – | Ruling: trigger fixed; conflicts with compat-oracle being internal |
| compat-oracle | approved | y | P | compat-oracle | 13 | 12 | R1 (60 s warm budget, not gated) | n | – | Restate R1 or add a timing check. The README compat rows are hand-written |
| completion-context | approved | y | NS | burgee/completions (execute lane) | 5 | 1 | R1–R4 | n | – | Ahead of default-command and typed-positionals |
| control-band-agent-schema-bytes | **dropped** (batch 0, `D-20261018-drop-control-band-agent-schema-bytes`) | n | DROPPED | benchmarks/bands | 2 | 2 | – | n | – | Recovered (flat 4,752 B). Cite D-20261012 step-change |
| control-band-cold-start-ratio | **dropped** (batch 0, `D-20261018-drop-control-band-cold-start-ratio`) | n | DROPPED | benchmarks/bands | 2 | 1 | – | n | – | Recovered (1.08), never attributed |
| control-band-commander-front-end-bundled-bytes | **dropped** (batch 0, `D-20261018-drop-band-commander-front-end-bytes`) | n | DROPPED | benchmarks/bands | 2 | 2 | – | n | – | Recovered (55,346) |
| control-band-core-bundled-bytes | **dropped** (batch 0, `D-20261018-drop-control-band-core-bundled-bytes`) | n | DROPPED | benchmarks/bands | 2 | 2 | – | n | – | Recovered (24,281) |
| control-band-yargs-front-end-bundled-bytes | **dropped** (batch 0, `D-20261018-drop-band-yargs-front-end-bytes`) | n | DROPPED | benchmarks/bands | 2 | 2 | – | n | – | Original breach gone; new +31 B 1σ drift does not gate |
| controlroom | approved | y | P | controlroom | 31 | 22 | R1/S4 PTY, R14/S7 W3 demo half, R16 controlroom-side lock, R22 per-boilerplate PTY job, S1 gallery, S3 100-run, S6 Ink fixture | **y** | save-restore, registry (parts) | Stale text fixed 2026-10-19 (batch 4): the intent, spec, `composition.json` and the README row say published at 1.0.3, and the two `#PR_NUMBER`s are #804 and #803 |
| controlroom-scroll-pane | **shipped** (batch 4, PR #1156) | y | NS | controlroom | 10 | 0 | R1–R6, S1–S4 | n (property test) | – | Fixed: a pane scrolls, follows its tail, and the static frame prints every line. Mutation 180 / 180 on the changed lines |
| declaration-summaries | review | y | NS | published artifacts / build scripts | 4 | 0 | R1–R4 | n | – | Wave-4 #2, early. Kill switch if the gzip saving is under 5% |
| default-command | review | y | NS | burgee/parse | 5 | 1 | R1–R4 | n | – | Adoption barrier (commander `isDefault`, yargs `$0`) |
| dev-loop | review | y | P | burgee/dev | 6 | 2 | W2 (`list_changed` in conformance), W3 (diff, not manifest), W4 byte-identical, W6 budget | **y** | **dev-reload.qnt** | Add three tests or restate |
| docs-deploy | **dropped** (batch 0, `D-20261018-drop-docs-deploy`) | y | DROPPED | docs-site | 10 | 7 | – | n | – | Ruling: folded into docs-per-package |
| docs-per-package | approved | y | P | docs-site | 23 | 17 | C8 (mutations per row), R2 orgId/secrets lock, R4/R5 partial, R7 PATCH lock, R10 env lock | n | – | Takes docs-deploy's R1–R6 |
| eslint-plugin-cli-floor | **dropped** (batch 0, `D-20261018-drop-eslint-plugin-cli-floor`) | y | DROPPED | eslint repo | 9 | 0 | – | n | – | Ruling: lives in eslint#1137 |
| extra-typings-drop-in | **shipped** (batch 0) | y | SHIPPED | burgee/types | 5 | 5 | – | n | – | U5 fails (55,661 vs 39,329 B), accepted by decision |
| facade-gets-more | **shipped** (batch 0) | **design.md** | SHIPPED | burgee/commander-facade | 6 | 6 | – | n | – | Rename `design.md` to `spec.md` so it can be approved. Its yargs numbers are stale (804, not 816) |
| facade-projection-fidelity | **shipped** (batch 3) | y | SHIPPED | burgee/yargs-facade | 6 | 6 | – | n | – | Batch 3: R4 built; `burgee/yargs` +424 B bundled (108,850 ceiling) and +852 B walked (221,700), recorded in D-20261019-yargs-facade-relations-bytes; still 0.974× yargs |
| first-adopter | review | y | NS | adoption/outreach | 5 | 0 | A1–A5 | n | – | The spec still names `commander-agent` and needs a rewrite. Barrier 5 (trust) |
| first-cli | approved (#1092, beside batch 0) | y | NS (on main) | burgee/init | 5 | 0 | R1–R5 (in #1092) | n | – | Rebase #1092; needs the Design→Build accept |
| fix-lines-every-shell | review | y | NS | burgee core (failure.ts) | 7 | 0 | R1–R4, S1–S3 | n | – | **LIVE DEFECT:** `fix:` lines are POSIX-quoted on Windows. Exclude `completions.ts` from R2's grep |
| flagstaff | approved | y | P | flagstaff | 23 | 19 | S1–S3 (restate where they live), S8 per-surface plugin case | **y** | **save-restore.qnt** | The `·` in loop/frame test names is stored as `Â·`, so `-t` misses |
| foundation-claims-watched | approved | y | P | benchmarks + CI | 10 | 9 | S3 (every `seen: null`; needs a fingerprint PR) | n | – | Nothing to build. Run compat-upstream, then a fingerprint PR |
| frames-fit-the-screen | **shipped** (batch 0) | y | SHIPPED | flagstaff + caique | 8 | 8 | – | n | – | R2 text (`rows-1`/`rows-2`) disagrees with the build. Correct the text before stamping |
| graded-override-targets | approved | y | P | compat-oracle (+migrate test) | 9 | 8 | SC3 (no migrate fixture importing all six) | n | – | Prior reconciliation was wrong here. One test |
| inquirer-prompts-drop-in | approved | y | P | caique + compat-oracle | 9 | 3 (+3 partial) | R3 (7 prompts unbuilt, 100/213), R4 (migrate and fingerprint), R5 weight row, S1, S3, S4; S2 restate | n | prompt-session (session) | Barrier 10 |
| linegauge | approved | y | P (spec edits) | linegauge | 18 | 16 | R4 (spec says outward, code rounds inward), R13 (`widths` plugin exists) | n | – | Prior reconciliation was wrong here. Spec edits only |
| locale-pack-in-five | review | y | NS | burgee check + evals | 6 | 0 | R1–R3, S1–S3 | n | – | Wave-4 #5. R3 needs paid eval runs, so quote the cost |
| localised-human-surfaces | approved (held in batch 0: no executed eval) | y | **LS** (eval caveat) | i18n (burgee + caique) | 11 | 11 | – (R7/S4 check exists; no passing run on main) | n | – | Needs one real eval run after the usage-limit miss. The intent's S1 command uses the wrong config |
| mcp-current | **shipped** (batch 0) | y | SHIPPED | burgee/mcp | 7 | 7 | – | **y** (in-flight map, cancel vs settle, exactly-once exit) | **none** | Recommend `.sdlc/models/mcp-inflight.qnt` before stamping |
| migrate-dynamic-specifiers | draft | **n** | SPEC | burgee/migrate | 3 | 0 | S1–S3 | n | – | Barrier 9 |
| migrate-older-majors | draft | **n** | SPEC | burgee/migrate | 3 | 0 | S1–S3 (S2 partial) | n | – | **Barrier 1** (83.7% get "nothing to rewrite"). Depends on previous-majors |
| migrate-pins-carry-the-drop-in | approved (#1124, beside batch 0) | **n** | SPEC — **IN-PROGRESS** | burgee/migrate | 2 | 0 | S1, S2 | n | – | **LIVE DEFECT** (svgo: `ERR_PACKAGE_PATH_NOT_EXPORTED`). Batch 1, local agent |
| migrate-preflight | draft | **n** | SPEC | burgee/migrate | 3 | 0 | S1–S3 | n | – | Barriers 2, 3 and 8 |
| migrate-release-age | approved | y | P | burgee/migrate | 6 | 5 | R3 (no `a \|\| b` exclude case) | n | – | One test. Cite pins-carry-the-drop-in as R1's within-major gap |
| output-stack-compat | review | y | P | compat-oracle | 8 | 4 (+3 partial) | R1/R5 drawing bucket, R4 drawing count, S1 inquirer/clack | n | – | The spec was never accepted. Decide on the drawing bucket |
| output-stack-research | review | y | P (doc) | docs-only | 10 | 0 automated | S1 (hypothesis rows vs "every row cites"), S3 (caique evidence table) | n | – | Doc edits only |
| paratext | **shipped** (batch 0) | y | SHIPPED | paratext | 20 | 20 | – | n | – | R11 is a 1.65× ratchet, heavier than ansi-escapes. The owner calls whether that is acceptable as product |
| parse-refusals | **shipped** (batch 0) | y | SHIPPED | burgee/parse | 5 | 5 | – | n | – | R4 shipped as `fix`, not `next[]`; say so in the header |
| plugin-contract | review | y | P | burgee check / plugins | 12 | 8 | R7 "data first" (restate; R5a hosts functions), C2 five modes, C3 check covers burgee only, C4 eval | n | – | The spec needs a full status table |
| positioning | **shipped** (batch 0) | y | SHIPPED | docs-only | 16 | 15 | – (R12 reported by decision) | n | – | |
| previous-majors | approved | y | NS (on main) | compat-oracle + façades + migrate | 6 | 0 (2 partial) | R1–R6 | n | – | **Barrier 1.** Rebase #1086 (R1, R2, R6); yargs 17 (R3–R5) remains |
| release-cadence | approved (#1124, beside batch 0) | **n** | SPEC — **IN-PROGRESS** | release | 3 | 0 | S1, S2, BATCH | **y** (7-day window with a fix exemption) | none | Barrier 5. Batch 1, local agent |
| replacement-parser | review | y | P | burgee/parse | 10 | 7 | G3 (quirks subpath; contradicts yargs-compat), G7, SC2 (1.55× ratchet, not ≤1×) | n | – | Restate to D-157 and drop G3 |
| roundel | **shipped** (batch 0) | y | SHIPPED | roundel | 17 | 17 | – | n | – | Rewrite the stale 2026-09-09 verified section |
| schema-bytes-gated | review | y | NS | benchmarks reliability | 3 | 0 | R1–R3 | n | – | Wave-4 #3. Copy the `SKILL_BYTES_BUDGET` gate |
| schema-is-validated | approved | y | P | burgee/schema | 3 | 2 | R3/SC3 (the cited lock is wrong) | n | – | Add a README-claim lock or restate as struck |
| sdlc-locks-evals-bands | review | y | P | sdlc locks | 10 | 7 | S2, R2/R3 (`.sdlc/intents` outside the link checker and evals paths) | n | – | Expect it to surface broken links |
| security-profile | **dropped** (batch 0, `D-20261018-drop-security-profile`) | y | DROPPED | burgee/security | 11 | 0 | – | n | – | Ruling: no adopter; exit-code clash |
| seniority | approved | y | P | seniority | 21 | 13 | R1/S2 truth-table page, R2/S5 shared precedence vectors, R7 extends chain in explain, R9 spawn delta, S3, S4 | n | – | The truth table is the product and is unproduced |
| supports-color-drop-in | approved | y | NS | roundel + compat-oracle | 9 | 0 | R1–R5, S1–S4 | n | – | 441.6 M/wk with no override target |
| table-column-widths | **shipped** (batch 0) | y | SHIPPED | flagstaff | 7 | 7 | – | n | – | |
| typed-positionals | approved (typed-schema-surface) | y | P | burgee/parse + types | 6 | 5 (R4 partial) | R4 `type` on `inputSchema`, completions | n | – | R1–R3 built 2026-10-19; R5 and R6 met (#1091) |
| types-under-node10 | draft | **n** | SPEC | published artifacts (`typesVersions`) | 3 | 0 | SC1–SC3 | n | – | **LIVE DEFECT / barrier 4:** TS2307 on node10 (38.8% of TS dependents) |
| u5-weight-claim | **shipped** (batch 0) | y | SHIPPED | benchmarks (weight) | 3 | 3 | – | n | – | Reads 0.97 in CI; trim the stale Verification paragraph |
| upstream-watch | **shipped** (batch 0) | y | SHIPPED | compat-oracle + CI | 8 | 8 | – | n | – | R5 and R7 are held by workflow config; cite those lines. Dedupe only searches open issues |
| vendor-resolves-its-own-tree | approved | y | P | compat-oracle | 3 | 2 | R3 (no real run without `node_modules`) | n | – | The spec's verify command has the wrong `--root` |
| windows-lane-holds | review | y | NS | workflows/CI + tests | 6 | 0 | R1–R5, S3 | n | – | **LIVE DEFECT:** the pwsh hang fails unrelated PRs (#1092, #1094). R3 goes first |
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
| closeout-at-incumbent-weight | missing: `lean.qnt` is required by its own R4 |
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
| 1 | **CI honesty** | workflows/CI + evals | windows-lane-holds (R3 pwsh hang first, then R1–R5) · **new defect: record a never-executed eval as `not-run`** (write intent + spec) · ci-affected-lanes (R4 reading once 20 PRs have merged) · localised-human-surfaces (stamp once a weekly run executes and passes `locale-pack-from-schema`; restate criterion 4's "one turn") · gap `A-20261018-dropped-band-intent-masks-breach` (watcher writes a new intent past a dropped one) | Live defects: the pwsh hang fails unrelated PRs, and the usage-limit run scored as 0/11. Eval-gated criteria in 5 intents wait on it |
| 2 | **Agent-surface defects** | burgee core (failure.ts, help) + floor | fix-lines-every-shell (R1–R4) · agent-lint-conformance (FS-4 regression, R7 ratchet) · agent-skill (C4 SD-5 via the same CI floor reading) | Live defects: Windows `fix:` lines break, and FS-4 regressed. One published CI floor reading closes two intents |
| 3 | **Façade fidelity and weight** | burgee/façades + weight ratchets | facade-projection-fidelity (R4 yargs conflicts, implies, example; byte decision) · commander-compat (X6 budget re-measure) · commander-front-end-diet (R4 ratchet 1.565→1.42) | Live defect: yargs relations are silently missing from `--schema` and MCP |
| 4 | **controlroom** | controlroom | controlroom-scroll-pane (R1–R6) · controlroom (gallery S1, R16 lock, stale "reserved" text, `#PR_NUMBER`s, add a controlroom Quint model) | Live defect: pane rows are unreachable. frames-fit-the-screen ships in batch 0, which unblocks it |
| 5 | **Older majors, graded** | compat-oracle + façades | previous-majors (rebase and land #1086, then yargs 17 R3–R5) · compat-oracle (R1 restate or gate) · vendor-resolves-its-own-tree (R3 real no-`node_modules` run) | Barrier 1 (2.51, then 1.70). Must precede migrate-older-majors |
| 6 | **migrate tells the truth** | burgee/migrate | migrate-older-majors (**write spec**) · migrate-preflight (**write spec**) · migrate-dynamic-specifiers (**write spec**) · migrate-release-age (R3 `a \|\| b` test) · graded-override-targets (SC3 fixture importing all six) | Barriers 1, 2, 3, 8 and 9. Starts after migrate-pins lands (same file) and after batch 5 |
| 7 | **Published types and bytes** | published artifacts / packaging | types-under-node10 (**write spec**, `typesVersions`) · declaration-summaries (R1–R4) · cli-packaging (R4 `.map` fixture) | Barrier 4 (the cheapest fix) plus wave-4 #2, early. All touch the artifact scripts |
| 8 | **First users** | burgee/init + outreach | first-cli (rebase and land #1092, Design→Build accept) · first-adopter (rewrite spec off commander-agent) · caller-matrix (**write spec**) | Barrier 5 (trust) |
| 9 | **Drop-ins in the compat-oracle lane** | caique/roundel + compat-oracle | inquirer-prompts-drop-in (R3 seven prompts, R4, R5) → supports-color-drop-in → colour-facades | Barrier 10, then wave-4 #6, in the order the lane rule fixes. Can split into 2 PRs |
| 10 | **closeout at incumbent weight** | closeout + weight ratchets | closeout-at-incumbent-weight (`lean.qnt` first, R1–R5) · closeout (S3 closes with it; refresh the stale section) | Wave-4 #1. Add closeout's new files to models.yml `paths:` |
| 11 | **Benchmark gates and readings** | benchmarks | schema-bytes-gated (R1–R3) · b1-mcp-arm (R5 page, investigate the missing weekly reading) · cli-benchmarks (B7, R6, R8, claim decision) · foundation-claims-watched (fingerprint PR for S3) | Wave-4 #3 |
| 12 | **burgee check + locale** | burgee check + evals | locale-pack-in-five (R1–R3; paid runs, quote the cost) · plugin-contract (R7 restate, C3 check beyond burgee, status table) | Wave-4 #5. Both edit check.ts. Needs batch 1's eval fix |
| 13 | **Parse and dispatch** | burgee/parse | completion-context (R1–R4) → default-command (R1–R5) → typed-positionals (R1–R4) · commander-schema (restate; positional half moves to typed-positionals) | Wave-4 #8 and #11, in the wave-3 lane order |
| 14 | **Output stack close-out** | flagstaff/caique (umbrella) | flagstaff (S1–S3 restate, S8, the `Â·` test names) · caique (R1 `promptFor`, S2, S3) · cli-output-stack (map rows to children) · output-stack-compat (drawing-bucket decision) · output-stack-research (caique evidence table) | Rest |
| 15 | **Foundation close-out** | linegauge/seniority/bellpull | linegauge (spec edits: R4 rounding direction, R13 `widths` plugin; moved here from batch 0) · seniority (truth-table page, shared vectors, R7, R9) · bellpull (**Quint model for the kill ladder**, S1, S4, S5) · cli-foundation-stack (restate drift, close via children) | Rest |
| 16 | **MCP and agent output** | burgee/mcp + agent-surface | `.sdlc/models/mcp-inflight.qnt` for shipped mcp-current (cancel vs settle, exactly-once exit; add its sources to `models.yml` `paths:`) · cli-mcp (drop the lint rule after the eslint move, C4 after batch 11) · agent-headroom (restate against N13/N14; R3, R5, RF) | Rest |
| 17 | **Docs and SDLC locks** | docs-site + sdlc locks | docs-per-package (C8 per row, R2, R7, R10 locks; absorbs docs-deploy) · sdlc-locks-evals-bands (`.sdlc/intents` into the link checker and evals paths) · schema-is-validated (R3 lock) · brand-burgee (**write spec**) | Rest |
| 18 | **burgee umbrella restatements** | burgee (umbrella) | burgee (Z4 15-line lock, Z5, F3/O3/P1 restated after the eslint drop, criteria 3–5) · commander-env (restate) · replacement-parser (drop G3, restate SC2/G7 to D-157) | Rest; mostly text |
| 19 | **Help, harness, dev loop** | burgee/help + testing + dev | cli-help-renderer (S1 min/max, S3 restate) · cli-testing-harness (ANSI case, S2/S4 restate) · dev-loop (W2, W3, W4, W6 tests; dev-reload.qnt exists) | Rest |

Coverage: each of the 63 intents still open after Batch 0 (the original 62, plus `localised-human-surfaces`, which Batch 0 held at `approved`) is in exactly one batch or in the in-progress row.
