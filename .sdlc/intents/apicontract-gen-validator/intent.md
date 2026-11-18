# Intent — validators and JSON Schema from any contract, including the subsets model providers accept

> Opened from the 2026-11-18 program ([`../apicontract/program.md`](../apicontract/program.md)).
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

`packages/apicontract/src/plugins/validator/**` and `src/plugins/json-schema/**`. Reads
`packages/validator` through its public exports only (`validator`, `validator/emit`).

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
