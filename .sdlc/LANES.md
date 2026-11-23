# Lanes — how `.sdlc/PLAN.md` runs in parallel

One lane is one sub-agent, one branch, one set of owned paths. A lane never writes
outside its globs, so two lanes can run at the same time and their branches merge
textually. This file is the contract; `scripts/lane-boundaries-lock.test.ts` enforces it.

**Ten lanes, not nine.** The first count missed that `roundel` and `flagstaff` are a
layer of their own — the output stack sits between the foundation six and the engine,
and `chalk` (wave 0.4, the red ratchet) is roundel's incumbent, not anyone else's.
`controlroom` made it eleven on 2026-09-27, when its skeleton landed (D-158, D-166), and
`oxmutate` twelve on 2026-10-27, and `truemark` one more on 2026-11-23.

## The lanes

| lane | branch | owns | blocked by |
| :-- | :-- | :-- | :-- |
| `harness` | `lane/harness` | `packages/compat-oracle/src/**`, `packages/compat-oracle/vendor/{cross-spawn,rc}/**`, `scripts/vendor-suite.ts`, `scripts/mine-issues.ts` | — (runs first) |
| `linegauge` | `lane/linegauge` | `packages/linegauge/**`, `.sdlc/intents/linegauge/**` | harness 2.0 |
| `paratext` | `lane/paratext` | `packages/paratext/**`, `.sdlc/intents/paratext/**` | harness 2.0 |
| `caique` | `lane/caique` | `packages/caique/**`, `.sdlc/intents/caique/**` | harness 2.0 |
| `seniority` | `lane/seniority` | `packages/seniority/**`, `.sdlc/intents/seniority/**` | harness 2.0 |
| `ac-spine` | `lane/ac-spine` | `packages/apicontract/src/run-*.ts`, `packages/apicontract/src/core/**`, `packages/apicontract/src/cli.ts`, `packages/apicontract/src/cli.test.ts`, `packages/apicontract/src/bin.ts`, `packages/apicontract/src/bin.test.ts`, `packages/apicontract/src/index.ts`, `packages/apicontract/src/host.ts`, `packages/apicontract/src/host.test.ts`, `packages/apicontract/src/commands.ts`, `packages/apicontract/src/inputs.ts`, `packages/apicontract/src/plugins.ts`, `packages/apicontract/package.json`, `packages/apicontract/README.md`, `packages/apicontract/CHANGELOG.md`, `packages/apicontract/tsconfig.json`, `packages/apicontract/tsconfig.build.json`, `packages/apicontract/vitest.config.ts`, `.sdlc/intents/apicontract/**`, `.sdlc/intents/apicontract-gen-command/**`, `packages/apicontract/src/__fixtures__/run/**` | 6.0 |
| `ac-types` | `lane/ac-types` | `packages/apicontract/src/gen-ts-*.ts`, `packages/apicontract/src/openapi-typescript.ts`, `packages/apicontract/src/openapi-typescript.test.ts`, `packages/apicontract/src/__fixtures__/id.openapi.yaml`, `packages/apicontract/src/__fixtures__/types/**`, `packages/apicontract/src/plugin-types*.ts`, `packages/compat-oracle/vendor/openapi-typescript/**`, `packages/compat-oracle/baseline/openapi-typescript.json`, `.sdlc/intents/apicontract-types/**` | 6.0 |
| `ac-inputs` | `lane/ac-inputs` | `packages/apicontract/src/openapi.ts`, `packages/apicontract/src/openapi.test.ts`, `packages/apicontract/src/input-jsonschema*.ts`, `packages/apicontract/src/input-asyncapi*.ts`, `packages/apicontract/src/input-mcp*.ts`, `packages/apicontract/src/input-swagger2*.ts`, `packages/apicontract/src/input-overlay*.ts`, `.sdlc/intents/apicontract-inputs/**`, `packages/apicontract/src/__fixtures__/inputs/**` | 6.0 |
| `ac-validate` | `lane/ac-validate` | `packages/apicontract/src/plugin-validator*.ts`, `packages/apicontract/src/plugin-json-schema*.ts`, `.sdlc/intents/apicontract-gen-validator/**`, `packages/apicontract/src/__fixtures__/validate/**` | 6.0 |
| `ac-extract` | `lane/ac-extract` | `packages/apicontract/src/extract-*.ts`, `packages/apicontract/src/plugin-extract-standard-schema*.ts`, `packages/apicontract/src/plugin-extract-openapi*.ts`, `packages/apicontract/src/plugin-extract-nest*.ts`, `packages/apicontract/src/plugin-extract-hono*.ts`, `packages/apicontract/src/plugin-extract-trpc*.ts`, `packages/apicontract/src/plugin-extract-ts-rest*.ts`, `.sdlc/intents/apicontract-extract/**`, `packages/apicontract/src/__fixtures__/extract/**` | 6.0 |
| `ac-servers` | `lane/ac-servers` | `packages/apicontract/src/plugin-nest*.ts`, `packages/apicontract/src/plugin-hono*.ts`, `packages/apicontract/src/plugin-fastify*.ts`, `packages/apicontract/src/plugin-express*.ts`, `packages/apicontract/src/plugin-server-*.ts`, `.sdlc/intents/apicontract-servers/**`, `packages/apicontract/src/__fixtures__/servers/**` | 6.0 |
| `ac-clients` | `lane/ac-clients` | `packages/apicontract/src/plugin-fetch*.ts`, `packages/apicontract/src/plugin-tanstack-query*.ts`, `packages/apicontract/src/plugin-msw*.ts`, `packages/apicontract/src/plugin-swr*.ts`, `.sdlc/intents/apicontract-clients/**`, `packages/apicontract/src/__fixtures__/clients/**` | 6.0 |
| `ac-agents` | `lane/ac-agents` | `packages/apicontract/src/plugin-mcp*.ts`, `packages/apicontract/src/plugin-markdown*.ts`, `packages/apicontract/src/command-explain*.ts`, `.sdlc/intents/apicontract-agents/**`, `packages/apicontract/src/__fixtures__/agents/**` | 6.0 |
| `ac-diff` | `lane/ac-diff` | `packages/apicontract/src/diff-*.ts`, `packages/apicontract/src/command-diff*.ts`, `.sdlc/intents/apicontract-diff/**`, `.sdlc/intents/apicontract-diff-decisions/**`, `packages/apicontract/src/__fixtures__/diff/**` | 6.0 |
| `ac-lint` | `lane/ac-lint` | `packages/apicontract/src/lint-*.ts`, `packages/apicontract/src/command-lint*.ts`, `packages/apicontract/src/plugin-lint-*.ts`, `.sdlc/intents/apicontract-lint/**`, `packages/apicontract/src/__fixtures__/lint/**` | 6.0 |
| `ac-kit` | `lane/ac-kit` | `packages/apicontract/src/testing*.ts`, `packages/apicontract/src/migrate-*.ts`, `packages/apicontract/src/scaffold*.ts`, `packages/apicontract/src/command-migrate*.ts`, `packages/apicontract/src/command-plugin*.ts`, `packages/apicontract/AGENTS.md`, `.sdlc/intents/apicontract-kit/**`, `packages/apicontract/src/__fixtures__/kit/**` | 6.0 |
| `ac-corpus` | `lane/ac-corpus` | `benchmarks/apicontract/**`, `.sdlc/intents/apicontract-corpus/**` | — |
| `validator` | `lane/validator` | `packages/validator/**`, `.sdlc/intents/validator/**`, `benchmarks/validator/**` | harness 2.0 |
| `triggerlist` | `lane/triggerlist` | `packages/triggerlist/**`, `.sdlc/intents/triggerlist/**`, `.sdlc/checklist.yaml`, `REVIEW.md` | — |
| `closeout` | `lane/closeout` | `packages/closeout/**`, `.sdlc/intents/closeout/**` | harness 2.0 |
| `bellpull` | `lane/bellpull` | `packages/bellpull/**`, `.sdlc/intents/bellpull/**` | harness 2.0 |
| `controlroom` | `lane/controlroom` | `packages/controlroom/**`, `.sdlc/intents/controlroom/**` | closeout R4 (controlroom spec R1); caique `./keys` and flagstaff's seam (R2, R3) |
| `oxmutate` | `lane/oxmutate` | `packages/oxmutate/**`, `.sdlc/intents/oxmutate/**` | — |
| `truemark` | `lane/truemark` | `packages/truemark/**`, `.sdlc/intents/truemark/**` | — |
| `output` | `lane/output` | `packages/roundel/**`, `packages/flagstaff/**`, `.sdlc/intents/roundel/**`, `.sdlc/intents/flagstaff/**` | — (0.4 is urgent) |
| `engine` | `lane/engine` | `packages/burgee/**`, `packages/commander-harness/**`, `packages/yargs-harness/**`, `.sdlc/intents/commander-*/**`, `.sdlc/intents/yargs-*/**` | — |
| `integrator` | `lane/integrator` | everything else: `.sdlc/PLAN.md`, `.sdlc/intents/README.md`, `.github/**`, root `README.md`, `scripts/*-lock.test.ts` | all lanes |

**A package lane owns the grading artefacts of its own incumbents**, and that is the second
exception to the table above: `packages/compat-oracle/vendor/<its incumbents>/**`,
`packages/compat-oracle/baseline/<its incumbents>.json`, and its own entries in
`packages/compat-oracle/src/hosts.ts`. The first run of wave 2 found the contradiction the
hard way — the table gave `packages/compat-oracle/**` wholly to `harness`, so
`lanes.ts --check` rejected every path two lanes had been told to write, including the
baseline fragment this file's own sharding rationale assigns to the lane. `hosts.ts` is the
one file several lanes append to at once; keep the diff to your own lines and expect a merge.

**Forbidden to every lane but `integrator`:** `package-lock.json`, `.sdlc/intents/README.md`,
`.sdlc/bands/**`, root `README.md`, `.github/**`, `turbo.json`, `PRINCIPLES.md`, `CLAUDE.md`.
The lockfile has its own trap (a Mac-regenerated lock fails Lockfile Sync); one lane
touching it is the only safe number.

**A lane taking its package from placeholder to implementation cannot leave `lint` green, and
that is expected.** `.sdlc/bands/artifact-size-baseline.json` allows 10% growth, and `bellpull`
going from a seven-line stub to a real package grew 921% packed and 1,467% unpacked. The check's
own message — *"bump the baseline deliberately or trim"* — asks for something the lane is
forbidden to do. So: **report the two numbers and leave the check red; the integrator runs
`--update-baseline` when merging.** Verify the rest of `lint` passes, and say in the report that
this is the only failure.

The durable fix is to shard that file per package, the way `packages/compat-oracle/baseline/`
was sharded for exactly this reason (PLAN `SHARD`) — a lane would then own its own fragment and
no two lanes could collide. Not done yet; it is a step, not a workaround.

## Step ownership

Three kinds, because three kinds exist:

- **own** — exactly one lane does it.
- **fan** — every package lane does its own share, in its own paths. Conflict-free by
  construction: twelve suites across six lanes is six branches touching six directories.
- **serial** — `integrator` only, because it rewrites whole-tree files.

| step | kind | lane |
| :-- | :-- | :-- |
| 0.1 rename `burgee` → `burgee` | serial | integrator |
| 0.2 roadmap index regenerator | serial | integrator |
| 0.3 merge queue ruleset | serial | **owner**, not an agent |
| 0.4 chalk 57 → 58 | own | output |
| 1.1 fold paratext's schema | own | paratext |
| 1.2 caique hosts `widgets` (+ D5 widening) | own | caique |
| 1.3 seniority hosts `sources` (+ D5 widening, R14 reconcile) | own | seniority |
| 1.4 closeout hosts `handlers` | own | closeout |
| 1.5 bellpull hosts `resolvers` | own | bellpull |
| 1.6 linegauge "no plugins, by design" | own | linegauge |
| 1.7 plugin-contract lock | serial | integrator |
| 1.8 schema projection in `schema-to-dist.mjs` | serial | integrator |
| 2.0 `vendor-suite.ts` + PROVENANCE | own | harness |
| 2.1 remove "drop-in" from five descriptions | serial | integrator (**published claim — stops and asks**) |
| 2.2–2.13 the twelve suites | fan | each package lane |
| 2.14 cross-spawn (jest) | own | harness |
| 2.15 rc (exit-code mode) | own | harness |
| 2.16 grade `@inquirer/core`, retarget caique | own | caique |
| 2.17 one control band per baseline entry | serial | integrator |
| 2.5.0-2.5.5 burgee's six surfaces | own | engine |
| 3.1 paratext R8–R12 | own | paratext |
| 3.2 seniority to 1.0 | own | seniority |
| 3.3 closeout to 1.0 | own | closeout |
| 3.4 bellpull built | own | bellpull |
| 3.5 linegauge R9–R10 | own | linegauge |
| 4.1 issue miner | own | harness |
| 4.2 issues ≥10 👍 → criteria + tests | fan | each package lane |
| 4.3 Y5 / Y9 / Y10 across every package | fan | each package lane |
| 4.4 upstream-watch release fingerprints | serial | integrator |
| 5.1 `/docs/benchmarks` rows | serial | integrator |
| 5.2 generated README lock | serial | integrator |
| 5.3 first-adopter | — | **person**, not an agent |
| 6.0 shard `packages/apicontract` for the lanes | serial | integrator |
| 6.1 `gen` and `extract` run for real | own | ac-spine |
| 6.2 types target closes Phase 1 | own | ac-types |
| 6.3 input adapters | own | ac-inputs |
| 6.4 `gen validator` and `gen json-schema` | own | ac-validate |
| 6.5 extractors and the round trip | own | ac-extract |
| 6.6 server generators | own | ac-servers |
| 6.7 clients and MSW | own | ac-clients |
| 6.8 `gen mcp`, `explain`, `gen markdown` | own | ac-agents |
| 6.9 `diff` | own | ac-diff |
| 6.10 conformance suite, scaffold, migrations | own | ac-kit |
| 6.11 corpus, grader, consumer harness | own | ac-corpus |
| 6.12 validator parity 143 → 154 and the benchmark | own | validator |
| 6.13 corpus scoreboard page and nightly workflow | serial | integrator |

Fifty steps: 36 `own`, 3 `fan`, 11 `serial`, of which two (0.3, 5.3) are not agent
work at all. Wave 6 (6.0–6.13) is the contracts program, cut in
[`intents/apicontract/program.md`](./intents/apicontract/program.md); its `ac-*` lanes replace the
single `apicontract` lane, and are disjoint only after 6.0 shards the package.

## Why the shared files get sharded first

Eight single files carry writes from every lane. Until they are sharded, "ten parallel
lanes" means ten merge conflicts:

| file | today | after |
| :-- | :-- | :-- |
| `packages/compat-oracle/baseline.json` | one dict, 8 keys, 12+ more coming from 6 lanes | `baseline/<incumbent>.json`, one file per lane-owned incumbent |
| `.sdlc/bands/release-budgets.json` | one `budgets` dict | `packages/<pkg>/budget.json` |
| `.sdlc/bands/control-bands.json` | one `bands` dict | derived from the fragments |
| `.sdlc/intents/README.md` | 214 hand-kept rows | generated (0.2), integrator only |
| `scripts/plan-progress.ts` | one condition array | `scripts/plan-progress/<wave>.ts` |
| `packages/*/src/schema.json` | one family schema | 1.1 then 1.7, serialized on purpose |
| `.sdlc/DECISIONS.md` | one table, every PR appending "the next id" | `.sdlc/decisions/D-YYYYMMDD-<slug>.md`, one file per decision (D-20260927-per-entry-ledgers) |
| `.sdlc/GAPS.md` | four tables, every PR adding or striking a row | `.sdlc/gaps/<letter>-YYYYMMDD-<slug>.md`, one file per gap |

`.changeset/*.md`, `.sdlc/decisions/*.md` and `.sdlc/gaps/*.md` need no sharding — each is
already one new file with a unique name, which is why no lane may hand-edit a `version` field
or take "the next" decision id. **Every lane may add one**, and those are the only exceptions
to the globs above: the integrator does not own `.changeset/**`, because a lane that changes a
published package is the only one that knows what to write in it — and a lane that takes a
decision or closes a gap is likewise the only one that knows what to write in that. The first run of these lanes caught the contradiction — the table said integrator, the
briefs said write one, and `lanes.ts --check` would have called every lane's changeset a
stray.

## Running

The merge queue is still **off** (checked 2026-09-22: `gh api repos/ofri-peretz/burgee/rulesets`
returns none; step 0.3 is the owner's, tracked as gap C6, `.sdlc/gaps/C6.md`). In practice every lane
already opens its own PR against `main` and lands it on its own — the `wave/<n>` batching this
section used to prescribe is not how the tree moves — and strict branch protection serialises the
merges: a PR behind `main` updates and re-runs before it can land. Releases are continuous
alongside that (see PLAN.md, *Releasing*): the one Version PR refreshes on every push that
carries a changeset. With the queue **on**, the update-and-re-run step moves into the queue.
Nothing else changes.

Order: `harness` 2.0 first (every package lane's suites need it) and `output` 0.4 in
parallel, because a red ratchet grades nothing landing after it. Then the six package
lanes and `engine` together. `integrator` closes each wave.
