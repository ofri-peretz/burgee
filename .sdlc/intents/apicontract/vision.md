# Vision — what `apicontract` and the validator can become

Intent: [`intent.md`](./intent.md) · Roadmap: [`roadmap.md`](./roadmap.md) · Validator:
[`../validator/intent.md`](../validator/intent.md) · **Status:** proposal, 2026-11-13, not accepted.

This file is the argument. The roadmap is the order of work. Nothing here is a claim for a README:
every "we win" below is a bet until its row in [`metrics.md`](./metrics.md) is measured and won
(PRINCIPLES rule 4).

## The one sentence

**A team describes an API once, in the format it already uses, and everything else is generated,
checked and kept in step: by the team's engineers and by the team's agents, through the same CLI.**

## The problem, in numbers

One API is written down many times: the spec, the types, the validators, the server handlers, the
client, the mocks, the tests, the docs, and now the tool definitions an agent calls. Each copy is
produced by a different tool with its own parser and its own reading of the spec.

Weekly npm downloads, read 2026-11-13 from `api.npmjs.org/downloads/point/last-week/<pkg>`:

| Copy of the API | What teams install for it today | Weekly |
| :-- | :-- | --: |
| Types from a spec | openapi-typescript (maintenance mode) | 16.7M |
| | @hey-api/openapi-ts | 7.3M |
| | json-schema-to-typescript | 6.4M |
| Clients from a spec | openapi-fetch | 16.5M |
| | orval | 3.7M |
| | @openapitools/openapi-generator-cli (Java) | 2.1M |
| Validators | ajv | 515.9M |
| | zod | 451.0M |
| Schema ↔ schema converters | zod-to-json-schema | 94.5M |
| | @asteasolutions/zod-to-openapi | 7.6M |
| | json-schema-to-zod | 3.7M |
| | drizzle-zod | 4.6M |
| Spec from server code | @nestjs/swagger | 11.6M |
| | @hono/zod-openapi | 4.3M |
| | tsoa | 0.6M |
| Mocks | msw | 33.2M |
| | @stoplight/prism-cli | 0.3M |
| Other protocols | @graphql-codegen/cli | 10.1M |
| | @bufbuild/protoc-gen-es | 3.9M |
| | @asyncapi/modelina | 0.2M |
| Agent tools | @modelcontextprotocol/sdk | 87.5M |

Three things follow from the table.

1. **The converters are the tell.** 94.5M weekly installs of `zod-to-json-schema` exist only because
   two copies of one schema have to agree. Every converter in that group is a seam where two tools
   read a schema differently. A tool with one model has no seams.
2. **No row covers two copies.** A team that wants types, a validator, a NestJS module, mocks and
   an MCP server from one spec installs five tools and owns the disagreements between them.
3. **The agent row is large and unled.** 87.5M weekly installs of the MCP SDK, and no generator
   leads it.

## The product, as three layers

| Layer | What it is | Package |
| :-- | :-- | :-- |
| **Model** | Every spec format reduced to one thing: operations with a direction, over JSON Schema. One `$ref` resolver, one reading of the spec | `apicontract/core` and one input folder per format |
| **Plugins** | A generator or an extractor is one plain object with a sample. Ours take no private path. A plugin for a technology goes both ways wherever that technology can, and the same plugin detects drift | `apicontract-gen-*`, `apicontract-<tech>` |
| **Runtime** | The validator the generated code runs on: authored in TypeScript or compiled ahead of time from a spec, one engine | the validator (working name; [`../validator/intent.md`](../validator/intent.md)) |

The CLI is the only surface. Because every command is a burgee declaration, each one is also
`--json`, `--schema` and an MCP tool with no extra code. There is no server, no account, no hosted
registry (PRINCIPLES rule 1).

## Where it changes the game for engineering teams

| # | Capability | What changes | Who is closest today, and the gap |
| :-: | :-- | :-- | :-- |
| 1 | **One parse, every output** | Types, validator, server, client, mocks, tests and docs come from the same model, so they cannot disagree. The class of bug "the type says string, the validator says number" is gone, not caught | hey-api (types, clients, some validators) and orval (clients, mocks). Neither generates servers, extracts, or diffs |
| 2 | **Both directions, round trip proven** | A code-first team gets a spec without a rewrite; a spec-first team gets code. `extract(gen(spec)) = spec` is a test on every plugin, so the direction a team starts from is not a lock-in | Nobody does both. @nestjs/swagger, zod-to-openapi and tsoa each go one way for one framework |
| 3 | **Regeneration never touches your code** | Every generated file is marked `generated` or `user`. Re-running after a spec change edits zero user lines. This is the reason generated servers get abandoned today | fastify-openapi-glue is the only regeneration-safe server incumbent; openapi-generator's NestJS server is beta and overwrites |
| 4 | **The generator is also the guard** | The plugin that wrote the NestJS controller is the one that fails CI when the controller drifts from the spec. `gen --check` fails when generated output is stale. No second tool to configure | PactFlow bi-directional (paid, hosted), Specmatic (Enterprise for non-OpenAPI) |
| 5 | **The long tail of in-house generators** | Every team has conventions no public generator knows: their error envelope, their auth wrapper, their folder layout. A plugin is small enough that the team's agent writes it and the conformance suite grades it | openapi-generator's templates (Mustache, Java to run), hey-api's plugin API (code, not data) |
| 6 | **A validator with no trade** | Today a team picks: Zod's ergonomics at 1.3M validations/s, or ajv's 11M/s with 593 ms to build 500 schemas and `new Function` (our 2026-11-12 reading, loaded machine, to be re-read). Ahead-of-time generation removes the trade: ajv-class speed, no runtime compile, a bundle that carries only the schemas used | typia (needs a compiler transform), TypeBox compiled (no authoring ergonomics to match Zod) |
| 7 | **TypeScript 5.9, 6.0 and 7.0 at once** | Output type-checks under all three, with no compiler at runtime. A TypeScript release stops being a reason a generator dies | openapi-typescript and hey-api both crash on TypeScript 7 today |

Rows 1 to 4 are one idea seen four ways: **one model**. That is the moat. Any single generator on
it is replaceable; the set that cannot disagree is not.

## Where it changes the game for agents

An agent that is asked to "add the endpoint from the spec" today reads a spec that does not fit its
context, writes the types, validator and handler by hand, and gets some of it wrong in ways that
type-check. Five capabilities change that, in the order they compound.

| # | Capability | What the agent does differently | Measured by |
| :-: | :-- | :-- | :-- |
| 1 | **Generate instead of write** | Calls `gen` as a tool and reviews a diff, instead of spending tokens writing glue that drifts. Deterministic: same spec, same bytes, every run | Agent eval: tokens, turns and contract violations with and without the tool |
| 2 | **Context the size of the question** | `explain <operation>` returns one operation fully resolved and size-capped, not a 2 MB document | SC10: the arm with `explain` beats the arm without |
| 3 | **A feedback loop that exits non-zero** | `check` and the generated contract tests fail with a `fix:` line the agent can act on, so "it type-checks" stops being the agent's definition of done | Violations left after one agent turn |
| 4 | **Any API becomes agent tools, and stays honest** | `gen mcp` turns a spec into an MCP server; `extract` and `diff` on a running or snapshotted server catch a tool schema changing under the agents that call it. `gen json-schema --dialect` emits the subset a model provider's tool-call or structured-output mode accepts, with a finding for every keyword it had to drop | SC10 (silent breaking changes found in 10 popular MCP servers); dialect conformance against each provider's documented subset |
| 5 | **Agents extend the tool** | A plugin is data plus one `run` function, with a schema and a sample. An agent given the schema and one example writes a passing plugin in one turn | SC6 / X3, weekly |

Row 5 is the compounding one. openapi-generator has more than fifty generators because volunteers
maintained templates for a decade. If an agent can write and prove a generator in one turn, the
catalogue is not limited by maintainers, and a team's private conventions are served the same day.

## What a team's week looks like when this works

1. `npx apicontract gen` in a repo with an `openapi.yaml`: types, validators, a NestJS module and
   MSW handlers appear, each file marked generated or user.
2. A product change edits the spec. `gen` rewrites generated files only. `diff` says the change is
   breaking for callers and writes the changeset. The contract test for the new operation fails
   until the handler exists.
3. An agent is asked to implement it. It calls `explain` for the one operation, writes the handler
   body, runs `check`, fixes what the `fix:` line names, and stops.
4. Another team's service has no spec, only NestJS controllers. `extract` writes one; from that
   moment it has everything in step 1.
5. The team's agent writes a plugin for the in-house error envelope. `apicontract check <plugin>`
   passes it. It is one file in the repo.
6. The same spec is served to the team's agents as an MCP server, and CI fails the day a tool's
   schema changes without a version bump.

## Where it is *not* a game changer

- **Types from OpenAPI alone.** It is the way in (16.7M weekly installs on a tool in maintenance
  mode), not the moat. A fork or hey-api can close that window; the kill rule in the roadmap covers it.
- **Lint.** Spectral and Redocly are fine. Table stakes, built only on request.
- **Other languages.** Go, Java and Python generators are their owners' business. We call their
  tools; we do not rebuild them.
- **Hosted SDK companies** (Stainless, Speakeasy, Fern). They sell publishing pipelines, docs sites
  and support. We are a package. We do not chase the hosted parts. Not verified against the field:
  what their generated TypeScript looks like next to ours is a reading the roadmap owes.
- **The validator, until it is measured.** Zod has 451M weekly installs and an ecosystem. "Better"
  is sixteen rows in the validator intent, and none is won yet.

## What would prove this wrong

| If we see | Then |
| :-- | :-- |
| An agent cannot write a passing plugin in one turn (X3) | The plugin API is not data-shaped enough; the long-tail argument is void until it is |
| The agent eval shows no gain from `gen` or `explain` as tools | Drop the agent claims and publish the reading; the generators still stand for teams |
| The round trip cannot hold without dropping refinements silently | "Both directions" becomes "extract with findings", and the lock-in argument is weaker |
| The validator cannot beat ajv on throughput ahead of time, or Zod on type-check cost | It ships as the generated target only, with the losing rows published, and Zod stays the authoring answer for users who want it |
| A second input format needs a core change | The model is wrong. Stop adding generators and fix it |

## What the owner is asked to decide

1. Is this the vision? If yes, it becomes the accepted positioning and the intent's first section
   points here.
2. The roadmap adds capabilities that were not in the 2026-11-12 order: provider dialects for
   JSON Schema, a typed client for MCP tools, a Markdown reference, `bundle` and `convert`, a
   data-layer wave, a Zod codemod. Each is marked **new** there. Accept, cut or reorder.
3. Two of them, MSW handlers and `gen mcp`, reopen part of a rejection recorded on 2026-11-06
   (no mocking, no MCP-server generation; stay sponsorable by the SDK companies). The roadmap states
   both sides. Publishable SDK generation stays rejected.
4. Still open from before: accept the design (R-PL), and confirm "beat them both" means Zod and ajv.
