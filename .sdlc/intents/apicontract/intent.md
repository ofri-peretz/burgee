# Intent — `apicontract`: a CLI that turns specs into code and code into specs, through plugins

> Stage 1 artifact of the AI-native SDLC. Opened 2026-11-06 after a scan of the JS/TS contract
> tooling landscape. Named for the category people already search, "API contract", which covers
> AsyncAPI events, MCP tools and gRPC as well as OpenAPI. Not `ox*`: oxc powers only `check`, so
> the name would promise an edge the main package does not have. Not a bare `contract*`: in JS
> that reads as smart contracts (`@celo/contractkit`, 7.6k weekly downloads).

**Status:** draft · **Opened:** `2026-11-06` · **Owner:** `@ofri-peretz`

Design: [`spec.md`](./spec.md) · Metrics: [`metrics.md`](./metrics.md) · Roadmap:
[`roadmap.md`](./roadmap.md)

---

> **A CLI that turns your specs into code, and your code into specs.** Point it at the OpenAPI, AsyncAPI or JSON Schema you
> already have and it generates what your team would otherwise write by hand: TypeScript types, a
> JS/TS validator or plain JSON Schema for ajv, NestJS modules, and whatever a plugin adds. Point it
> at the code you already have (validator schemas, NestJS controllers, Hono or Fastify routes) and it
> writes the spec. Every generator and extractor is a plugin, ours included, so anyone can write one. Local, free, and no dependencies
> outside the burgee family.

That is the owner's definition, given 2026-11-11 ([`D-20261112-apicontract-is-a-generator`](../../decisions/D-20261112-apicontract-is-a-generator.md)). It replaces
the statement this intent opened with on 2026-11-06, "one contract tool for every API in your repo",
which led with `diff` and `explain`. Those commands stay in the plan behind the generators. The
competitor verdicts of 2026-11-06 are in
[`landscape.md` § Competitor review](./landscape.md#competitor-review--where-the-value-is-significant);
the generator and plugin claims above have not been checked against the field in the same way yet
(see Open questions).

## What is wanted

One CLI, built on burgee, that reads the specs a TypeScript team already has and generates code from
them, and specs from their code, through plugins. `gen` and `extract` are the product; the other commands read the same contracts and come
after it ([`roadmap.md`](./roadmap.md)):

| Command | Job | Incumbent it beats |
| :-- | :-- | :-- |
| `gen` | Spec → code, one plugin per target: TypeScript types (the migration path off openapi-typescript), our validator, JSON Schema for ajv, NestJS modules, then more | openapi-typescript (maintenance mode), hey-api, openapi-generator's NestJS server (beta), json-schema-to-typescript, Modelina |
| `extract` | Code → spec, one plugin per source: our validator's schemas, Zod, NestJS, Hono, Express, Fastify, tRPC/oRPC; round trip with `gen` verified | @nestjs/swagger, zod-to-openapi, @hono/zod-openapi, tsoa (one framework each) |
| `diff` | Breaking-change verdict between two refs, under the compatibility mode and side (caller or server) you pick; code-first contracts across git refs with no spec file | oasdiff, Redocly CLI `diff` (2026-10-28), Atlassian openapi-diff (stale), Optic (archived), `@asyncapi/diff`, mcpdiff |
| `explain` | One operation, message or tool, fully resolved and size-capped, for an agent's context | reading the raw spec; kadykov schema-explorer, oasdiff's hosted MCP |
| `check` | Code call sites against the contract, statically, no running server | PactFlow bi-directional (paid), Specmatic (Enterprise for non-OpenAPI), apibreak |
| `lint` | Spec rules with `fix:` lines, reading Spectral rulesets (only on pull) | Spectral, Redocly CLI, vacuum |

Contract families, all reduced to one model (operations with a direction, over JSON Schema). The aim is
every protocol where `apicontract` adds value; [`landscape.md`](./landscape.md) maps each one to the
commands we own and the owners' engines we wrap:

- **Request/response:** OpenAPI 3.0–3.2 including webhooks, OpenRPC, protobuf/gRPC, GraphQL SDL.
- **Messages and events:** AsyncAPI 3 over **WebSocket**, SSE, Kafka, MQTT, AMQP; CloudEvents; Avro.
- **Agent tools:** MCP `tools/list`, live or snapshotted.
- **Code-first:** Standard JSON Schema (Zod, Valibot, ArkType), oRPC, ts-rest, socket.io events.
- **CLI:** burgee command declarations — the family dogfoods its own contracts.

Every command is a burgee declaration, so each one gets `--json`, `--schema`, MCP, completions and
burgee's exit codes without extra code. Every package has published leading and lagging metrics, and
each metric is measured with the same script, subject and machine against the incumbent it replaces
([`metrics.md`](./metrics.md)).

## Why now

| Evidence | Source |
| :-- | :-- |
| openapi-typescript crashes on TypeScript 7: it builds output with `ts.factory`, which TS 7 does not ship. Open since 2026-07-09, no merged fix | [openapi-ts/openapi-typescript#2841](https://github.com/openapi-ts/openapi-typescript/issues/2841) |
| openapi-typescript's last maintainer commit was 2026-02-27; "Is this project still maintained?" has 50 👍 and no clear answer | [#2843](https://github.com/openapi-ts/openapi-typescript/issues/2843) |
| Optic, a TS-ecosystem breaking-change tool, was archived 2026-01-12; the remaining default (oasdiff) is Go | [FlareCanary, 2026](https://dev.to/flarecanary/optic-is-dead-what-now-for-api-drift-detection-2kb8) |
| MCP schema-diff tools are appearing now and are fragmented: mcpdiff v0.1.0 (Go, 2026-11-04), mcp-lint, mcp-tools-lint, mcp-catalog-snap, pytest-mcp-server, ToolDiff | [mcpdiff](https://github.com/celaldrg/mcpdiff/releases/tag/v0.1.0), [schema drift post](https://dev.to/nesquikm/my-mcp-tools-broke-silently-schema-drift-is-the-new-dependency-hell-5c49) |
| openapi-typescript entered maintenance mode on 2026-09-19 and names no successor; a fork (`openapi-typesafe`, 2026-11-02) and hey-api are already courting its 15.4M weekly installs | [#2874](https://github.com/openapi-ts/openapi-typescript/issues/2874) |
| Redocly added an experimental breaking-change `diff` to its CLI (4.2M weekly) on 2026-10-28: "direction-aware" alone no longer differentiates | competitor review, 2026-11-06 |
| ~325k weekly installs sit on unmaintained diff tools: Atlassian `openapi-diff` (no release since 2025-08, ~240k) and archived Optic (~85k) | competitor review, 2026-11-06 |
| New entrants this autumn confirm the demand: `apibreak` (caller-side vendor-spec diff, 2026-09), `specdrift` (2026-10-30) | npm registry |
| No JS/TS tool covers more than one contract family, and none is built for agents to call | landscape scan, 2026-11-06 |

These are dated observations, not measurements. The first measurements are the Phase 0 baselines in
[`metrics.md`](./metrics.md).

## Affected users and systems

- **Primary persona:** an engineering team that has specs and writes the matching types, validators
  and server modules by hand, or with generators that overwrite their code on every run.
- **Secondary persona:** an openapi-typescript user who is blocked on TypeScript 7.
- **Plugin authors:** anyone who wants a generator for their stack, including coding agents: the
  bar is that an agent writes a passing plugin in one turn (PRINCIPLES rule 7).
- **Coding agents as callers:** every command answers `--json`, `--schema` and `--mcp`; the agent
  claims for `explain` and `check` are measured in their own phases.
- **Customer zero:** burgee itself (CLI contracts through `diff`) and snappy-client-dashboard
  (OpenAPI clients, JSON Schema URL contracts that PostHog payloads share).
- **Repo:** one package per purpose (diff, gen, extract, schema, check, and the umbrella `apicontract`), with extensions such as `apicontract-gen-nest` — see [`spec.md` § Packages](./spec.md#packages--one-per-purpose-r-p)
  ([`spec.md`](./spec.md) § Packages); `compat-oracle` grades the drop-ins; a docs app is added per
  public package; `.github/workflows/models.yml` runs the new Quint models; oxmutate gates each
  package.

## Constraints

- No dependency outside the burgee family. YAML is read with `seniority/yaml`; processes use
  `bellpull`.
- No TypeScript compiler at runtime. Generated output type-checks under TS 6 `tsc` and TS 7
  `tsrs`.
- Node `^20.19.0 || >=22.13.0`, the same range as the rest of the family.
- Drop-in paths read the incumbent's config and write the incumbent's output, so switching is one
  change in `package.json`.
- Behaviour with state or ordering has a Quint model that runs in CI before its code merges
  ([`spec.md`](./spec.md) R-Q).
- Every package holds an oxmutate score floor ([`spec.md`](./spec.md) R-M).
- A claim of "better" only counts on a metric measured with the same script, subject and machine
  against the incumbent. Losing numbers are published too.

## Success criteria

1. **SC1:** `apicontract gen` output is byte-identical to openapi-typescript on 100% of
   openapi-typescript's own fixtures, graded by `compat-oracle`.
2. **SC2:** Our own generators are plugins written only against the public plugin API; a lock fails
   the build when one reaches an internal (R-EX5).
3. **SC3:** From one spec, `gen validator` and `gen json-schema` both produce output that accepts
   and rejects the same payloads on the fixture corpus, and the JSON Schema runs in ajv unchanged.
4. **SC4:** The round trip holds: `extract(gen(spec))` equals `spec` after normalisation on every
   corpus document, and no refinement, transform or decorator is dropped without a finding (R-RT).
5. **SC5:** Regenerating NestJS modules after a spec change edits zero lines of user-owned code, and
   every generated operation has a passing contract test.
6. **SC6:** An agent given the plugin schema and one example writes a plugin that passes the
   conformance suite in one turn, measured weekly.
7. **SC7:** Each new input format or generator lands as one folder with zero lines changed in the
   core (`git diff --stat` on the PR).
8. **SC8:** Every leading metric in [`metrics.md`](./metrics.md) is measured on every PR, and every
   lagging metric weekly. Each one is a control band, and each beats the competitor it names.
9. **SC9:** Every Quint model passes `--invariant=safety` in `models.yml`, and each package's
   oxmutate score is at or above its floor in `mutation-ratchets.json`.
10. **SC10 (phases 5 to 7):** on the agent eval, the arm with `explain` beats the arm without it;
   `diff` agrees with oasdiff on its own corpus at the Phase 0 target with every disagreement
   explained; and over the version history of 10 popular MCP servers `diff` finds at least one
   breaking change that shipped without a major version bump.

## Open questions

Every question this intent raised is closed; each bullet keeps the question and points at its
answer. `apicontract` is the working name; the final name is decided before the first publish. Pending actions (the npm names, the final name) are tracked in [`phase0.md`](./phase0.md).

- Will openapi-typescript's maintainers accept a compiler-free emitter upstream? Answered: not a
  question this repository can close; the offer is a Phase 0 action waiting on the owner's approval
  ([`phase0.md`](./phase0.md)), and the kill rules in [`roadmap.md`](./roadmap.md) cover either reply.
- Has hey-api absorbed openapi-typescript's users as a plugin? Answered 2026-11-06: no; none of the
  last 30 hey-api/openapi-ts releases mention one ([`phase0.md`](./phase0.md)).
- What state are json-schema-to-typescript and quicktype in? Answered 2026-11-06: both maintained,
  last published 2026-08-28 and 2026-07-20, at 6.2M and 252k weekly downloads
  ([`phase0.md`](./phase0.md)).
- Does `diff` use oasdiff's rule ids or our own? Decided:
  [`D-20261106-apicontract-diff-rule-ids`](../../decisions/D-20261106-apicontract-diff-rule-ids.md).
- Which MCP servers form the SC10 corpus? Decided:
  [`D-20261106-apicontract-mcp-corpus`](../../decisions/D-20261106-apicontract-mcp-corpus.md).
