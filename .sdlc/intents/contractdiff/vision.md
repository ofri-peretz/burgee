# Vision — what `apicontract` and the validator can become

Intent: [`intent.md`](./intent.md) · Roadmap: [`roadmap.md`](./roadmap.md) · Validator:
[`../valz/intent.md`](../valz/intent.md) · **Status:** accepted 2026-11-18 ([`D-20261118-contracts-program-go-ahead`](../../decisions/D-20261118-contracts-program-go-ahead.md)); proposed 2026-11-13; the field re-read 2026-11-18 in [`../../research/contracts-2026-11/`](../../research/contracts-2026-11/) · Program: [`program.md`](./program.md)

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
| **Runtime** | The validator the generated code runs on: authored in TypeScript or compiled ahead of time from a spec, one engine | the validator (working name; [`../valz/intent.md`](../valz/intent.md)) |

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

## The field moved, 2026-11-18

Read that day; every number and link is in [`../../research/contracts-2026-11/`](../../research/contracts-2026-11/).
Downloads inflated across npm in the last year (zod 8.4×, typescript 4.2× year on year), so the
research compares growth against those controls, not raw counts.

| What happened | What it opens |
| :-- | :-- |
| **Hey API stalled.** Last stable 0.99.0 on 2026-06-22, last commit 2026-09-30, 561 open issues, one maintainer, "fund this feature" added to every issue template on 2026-08-24. Still the download leader among full generators (7.7M weekly) | Its users' top requests are targets, not core: MSW 372 👍, Effect client 180, Hono 154, Faker 129, SWR 119, Express 60, case transforms 55. Every one is a plugin on one model |
| **openapi-fetch and the openapi-ts clients went into maintenance** on 2025-12-29; openapi-typescript last released 2026-02-11 and crashes on TypeScript 7 | 17.3M + 18.2M weekly with no active owner. Byte-identical output plus a codemod is a one-line switch |
| **Stainless was acquired by Anthropic** (2026-05-18) and closed to new signups; **Fern went to Postman** (2026-01-08); **Speakeasy open-sourced its generator under AGPL-3.0** (2026-09-17) | The paid SDK generators are being absorbed or going copyleft. An MIT, zero-dependency generator with regeneration safety is now a gap, not a crowded niche |
| **Orval and Kubb ship MCP generation, agent skills and `AGENTS.md`.** Kubb's contributors include `claude` (1,009 commits) and Copilot (756); it releases daily | Agent-assisted maintenance is table stakes for velocity. What nobody has is a plugin format an agent can write *and a suite that grades it*, so outside agents add targets safely |
| **MCP SDK v2 takes Standard Schema and Standard JSON Schema** for tool schemas and swaps its validator; **TypeScript 7** has no compiler API; **OpenAPI 3.2** is fully read only by Kubb; Overlay 1.2 and Arazzo 1.1 are unclaimed by TypeScript generators | Our validator plugs into every MCP server; extraction must not depend on the compiler API; 3.2 and Overlay are cheap leads |
| **ts-rest is archived** (967k weekly) and the original `trpc-openapi` abandoned; every no-run extractor loses schema *values* because it reads *types* | Extraction through Standard JSON Schema keeps the values; ts-rest users need a way out |

## How we become the best open-source project in contracts

"Best" is not a feeling. It is six things a person can check, each with a number in
[`metrics.md`](./metrics.md) or a row added by the program's intents.

### 1. Correct on real contracts, and it says so in public

No incumbent publishes a pass rate on real specs; their trackers are full of "crashes on spec X". We
run every generator over a pinned corpus of 2,000+ public OpenAPI documents, the AsyncAPI examples,
ten MCP servers and SchemaStore, beside openapi-typescript, Hey API, orval and kubb, and publish the
table nightly with the losing rows ([`apicontract-corpus`](../apicontract-corpus/intent.md)). This is
the claim every other claim stands on, and it is the regression net that lets ten lanes move at once.

### 2. A drop-in exit from every stalled tool

Each of these gets byte-compatible output where that is possible, a codemod for config and imports,
and a migration guide graded on the incumbent's own fixtures (PRINCIPLES rule 3):

| From | Weekly | State | Our route |
| :-- | --: | :-- | :-- |
| openapi-typescript | 17.3M | last release 2026-02-11, TS 7 crash | `--compat openapi-typescript`, 61/61 upstream cases ([`apicontract-types`](../apicontract-types/intent.md)) |
| openapi-fetch | 18.2M | maintenance since 2025-12-29 | the `fetch` client with an openapi-fetch-shaped `createClient` ([`apicontract-clients`](../apicontract-clients/intent.md)) |
| @hey-api/openapi-ts | 7.7M | stalled since 2026-06-22 | `apicontract migrate hey-api` reads `openapi-ts.config.*` and writes ours, plugin by plugin |
| ts-rest | 1.0M | archived | `extract --from ts-rest`, then `gen` the server and client ([`apicontract-extract`](../apicontract-extract/intent.md)) |
| openapi-zod-client | 0.3M | no release since 2025-02-10 | `gen validator`, and `--dialect` when the reason was Zod-for-LLMs |
| Stainless | — | closed to new signups | regeneration-safe servers and clients from the spec they already have; we do not rebuild the hosted SDK pipeline (rejected 2026-11-06, stands) |

### 3. One model, so the outputs cannot disagree, in both directions

Unchanged from above, and now the sharpest contrast: orval ships many targets from one parser but
no server, no extraction and no diff; kubb has adapters and plugins but extracts nothing; Hey API
has a plugin per target and is not shipping. Types, validators, servers, clients, mocks, MCP tools,
docs and diffs from one parse, and the spec back from code, round trip proven per plugin.

### 4. Regeneration never touches your code

What Stainless and Speakeasy sold, and what no open-source generator does well: generated files
are rewritten, user files are written once, a hand edit in a generated file is refused, never lost
(N1 = 0, [`apicontract-gen-command`](../apicontract-gen-command/intent.md)). Former Stainless
customers who can no longer regenerate are the first audience to tell.

### 5. Agents extend it, and a suite grades what they write

Kubb proves agents can maintain a generator. We go one step further: a plugin is data plus one
function, the conformance suite grades any plugin (round trip, regeneration, determinism, coverage,
consumer type-check), and `apicontract plugin new` scaffolds one. So a team's agent writes the
generator for its own error envelope or auth wrapper in one turn (X3), and a stranger's agent can
add the Zustand target Hey API's users have asked for since 2024 without a maintainer reading every
line. The top unmet target requests become a public board of plugin issues with the suite as the
acceptance test.

### 6. The agent era is first-class, not a plugin

`gen mcp` hands the MCP SDK precompiled validators; `--dialect` narrows a schema for each model
provider and re-checks the answer against the full schema locally; `explain` and `gen markdown`
(with `llms.txt`) give agents one operation, not a 2 MB document; every command is an MCP tool and a
skill through burgee ([`apicontract-agents`](../apicontract-agents/intent.md),
[`apicontract-gen-validator`](../apicontract-gen-validator/intent.md)).

### How the community grows, measured

| Lever | What we do | Measured by |
| :-- | :-- | :-- |
| Licence | MIT, zero runtime dependencies outside the family (G4) | stated; checked by `dependency-claim-lock` |
| Cadence | Release on merge (no window since 2026-10-27); upstream tracked within 7 days | Q4 ≤ 14 days, Q5 ≤ 7 days |
| Triage | Every issue answered within 48 hours with either a fix plan or a `fix:` line; requests ranked by 👍 like this document ranks theirs | median first response, published |
| Contribution path | Every target request becomes a plugin issue with the conformance suite as its acceptance test, labelled for agents and people | X4, third-party plugins passing |
| Agent distribution | `AGENTS.md`, a Claude Code plugin with skills, `--mcp` on the CLI, `llms.txt` on the docs | X3 weekly; installs of the plugin |
| Proof | The corpus scoreboard and every incumbent's own suite, published with the losing rows | the scoreboard page exists and is current |

## Where it is *not* a game changer, re-read

The 2026-11-13 list stands, with two changes: **performance is not what users ask for** (no
top-voted issue on Hey API, orval or kubb is about speed), so G2 and R2 stay measured but never lead
a launch post; and **breadth alone is not a moat** (orval already ships most targets), so a target
counts only when it passes the shared definition of done in [`program.md`](./program.md).

## What would prove this wrong, re-read

The 2026-11-13 table stands. Added:

| If we see | Then |
| :-- | :-- |
| Hey API resumes weekly releases and clears its backlog before our first public release | Lead with regeneration safety and extraction, not migration from it |
| The corpus pass rate of our types target is below openapi-typescript's on the full corpus | The migration claim is withheld until it is not; the number is published either way |
| Agents writing plugins pass the suite but users report broken output | The suite grades the wrong things; fix the suite before accepting more outside plugins |
