# Intent — validators and JSON Schema from any contract, including the subsets model providers accept

> Opened from the 2026-11-18 program ([`../contractdiff/program.md`](../contractdiff/program.md)).
> Roadmap Phase 2. The validator package on `main` already compiles JSON Schema to straight-line
> code (`from-json-schema.ts`, `emit.ts`) and reads 143 of 154 parity features. Nothing yet turns a
> contract's payloads into those validators, or into plain JSON Schema for the ajv a team already runs.

**Status:** approved · **Opened:** `2026-11-18` · **Owner:** `@ofri-peretz` · **Lane:** `ac-validate` ·
**Accepted by:** [`D-20261118-contracts-program-go-ahead`](../../decisions/D-20261118-contracts-program-go-ahead.md)

---

## What is wanted

Two generator plugins on the public host API; the user picks the target (owner, 2026-11-11):

- **`validator`** — one module per contract: for each operation and payload, a named validator
  compiled ahead of time by the validator package's emitter, its inferred TypeScript type, and an
  `operations` map so a server plugin can look a validator up by id. No `new Function`, no runtime
  compile, tree-shakeable per operation.
- **`json-schema`** — one file per payload, draft 2020-12 (default) or draft-07, every `$ref`
  either kept as a `$defs` entry or inlined (`--refs keep|inline`), that the team's own ajv compiles
  unchanged (J1). With `--dialect <openai|anthropic|gemini|mcp>` it emits the subset that provider's
  tool-call or structured-output mode accepts and reports one finding per keyword it dropped or
  rewrote (vision, agents row 4).

**Narrow, then re-check.** No provider accepts full JSON Schema (read 2026-11-18): OpenAI strict mode
needs every property required, `additionalProperties: false`, and no `allOf`/`oneOf`/`not`;
Anthropic takes no recursion and no numeric or length bounds, caps 24 optional and 16 union
parameters per request; Gemini drops keywords it does not enforce, silently. So `--dialect` emits
two things per payload: the narrowed schema the provider accepts, and a `validator` for the *full*
schema that checks the model's answer locally, with the dropped constraints listed as the reason
the re-check exists. Anthropic's SDK does a narrow version of this for its own models; nothing does it
across providers.

## Why now

The validator is the runtime the generated code runs on (vision, layer 3), and `zod-to-json-schema`
(94.5M weekly) exists because a schema has to be translated for model providers. A provider-dialect
generator with findings is a capability no incumbent has (roadmap row marked **new**, accepted here).

## Affected users and systems

`packages/contractdiff/src/plugin-validator*.ts` and `src/plugin-json-schema*.ts`. Reads
`packages/loadline` through its public exports only (`validator`, `validator/emit`).

## Constraints

- Zod is never emitted (R-SC0).
- The validator package's API is used as published; a missing export is asked of the `validator`
  lane in its own PR, not added from this lane.
- Every dropped or rewritten keyword is a finding (J3 = 0 silent losses).
- Dialect tables cite the provider's documentation page and the date it was read, in the source.

## Success criteria

- J1: 100% of the corpus lane's bench-spec payload schemas compile in ajv 8 unchanged.
- J2: on the fixture payloads, ajv over `json-schema` output and the `validator` output agree on
  every verdict (100%).
- J3: zero silent losses on the fixture set; a test enumerates every JSON Schema keyword and asserts
  each is either kept or produces a finding, per dialect.
- R2: generated validators beat ajv on validations per second on the bench payloads
  (`benchmarks/validator/baseline.ts`, same machine, same run).
- `sample` present for both generators; X1 = 0 (no import outside the public plugin API).

## Defaults taken

- Dialect tables ship for `openai` (structured outputs strict mode), `anthropic` (tool `input_schema`),
  `gemini` (function declarations, OpenAPI-subset schema), `mcp` (2020-12, no network `$ref`, the
  2026-07-28 spec) and `mcp-elicitation` (flat primitives only). Others are a plugin away.
- The `validator` target's output imports the validator package at run time (for formats and issue
  formatting); a fully standalone output (`--standalone`) is a later step if bundle readings ask.

## Evidence sweep 2026-11-22

Read on `main` at `daee10f` (2026-11-22) against the merged Wave 6 PRs (#1617–#1653) and the committed readings under `benchmarks/apicontract/results/`; `vitest run` in `packages/contractdiff` (2,545 tests) and `packages/loadline` (1,153) is green there. 4 of 6 rows met on fixtures. J1 on the corpus bench payloads and the mutation floor are open.

| # | criterion | held by | state |
| --: | :-- | :-- | :-- |
| 1 | J1: 100% of the bench-spec payload schemas compile in ajv 8 unchanged | Read on 3 fixture documents in every draft, ref mode and dialect (`plugin-json-schema.test.ts`, ajv 8.20.0 strict); not on the corpus bench | **open**: the corpus reading |
| 2 | J2: ajv over `json-schema` and the `validator` output agree 100% on the fixtures | `plugin-validator.test.ts`: 100% on 2020-12; draft-07 differs only where a finding says so | met |
| 3 | J3 = 0 silent losses, keyword-enumeration test per dialect | 49 keywords + 21 others × 3 sources × 2 drafts, and 50 × 5 dialects | met |
| 4 | R2: generated validators beat ajv on validations per second | bench order schema, same process: about 1.5× valid and 1.9× invalid (load average 30, so a ratio) | met, as a ratio on a loaded machine |
| 5 | `sample` for both; X1 = 0 | both plugins carry samples `checkPlugin` accepts (#1629); `validators.ts` typed without `@ts-nocheck` (#1642) | met |
| 6 | Mutation floor (program definition of done, item 5) | changed-line survivors killed in #1629; `.sdlc/bands/mutation-ratchets.json` has `apicontract: unmeasured` | **open**: no floor until the first full mutation reading |

Status stays `approved`: `apicontract` is `private` and unpublished, and [`D-20261119-apicontract-stays-private`](../../decisions/D-20261119-apicontract-stays-private.md) reserves `shipped` for published work; a lane that meets every criterion is recorded as "criteria met, unpublished".
