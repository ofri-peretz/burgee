# Intent — `apicontract`: the contract toolkit for coding agents, on burgee

> Stage 1 artifact of the AI-native SDLC. Opened 2026-11-06 after a scan of the JS/TS contract
> tooling landscape. Named for the category people already search, "API contract", which covers
> AsyncAPI events, MCP tools and gRPC as well as OpenAPI. Not `ox*`: oxc powers only `check`, so
> the name would promise an edge the main package does not have. Not a bare `contract*`: in JS
> that reads as smart contracts (`@celo/contractkit`, 7.6k weekly downloads).

**Status:** draft · **Opened:** `2026-11-06` · **Owner:** `@ofri-peretz`

Design: [`spec.md`](./spec.md) · Metrics: [`metrics.md`](./metrics.md) · Roadmap:
[`roadmap.md`](./roadmap.md)

---

## What is wanted

One CLI, built on burgee, that reads every kind of API contract a TypeScript team ships and does
every contract job an agent needs, with one vocabulary:

| Command | Job | Incumbent it beats |
| :-- | :-- | :-- |
| `gen` | Spec → TypeScript types | openapi-typescript, json-schema-to-typescript, Modelina |
| `explain` | One operation, message or tool, sized for an agent's context | reading the raw spec |
| `diff` | Breaking-change verdict between two refs, direction-aware | oasdiff, Optic (archived), mcpdiff, mcp-lint |
| `check` | Code call sites against the contract | openapi-usage, API Ghost Hunter |
| `lint` | Spec rules with `fix:` lines (only on pull) | Spectral, Redocly CLI, vacuum |

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
| No JS/TS tool covers more than one contract family, and none is built for agents to call | landscape scan, 2026-11-06 |

These are dated observations, not measurements. The first measurements are the Phase 0 baselines in
[`metrics.md`](./metrics.md).

## Affected users and systems

- **Primary persona:** a coding agent working in a TypeScript repo, and the tech lead who gates it.
  The agent needs the contract truth, and the lead needs a check that fails when the agent invents
  an endpoint, a field or a tool argument.
- **Secondary persona:** an openapi-typescript user who is blocked on TypeScript 7.
- **Customer zero:** burgee itself (CLI contracts through `diff`) and snappy-client-dashboard
  (OpenAPI clients, JSON Schema URL contracts that PostHog payloads share).
- **Repo:** new packages `apicontract`, `apicontract-check` and `apicontract-guard`
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
2. **SC2:** On the agent eval, the arm with `apicontract` beats the arm without it on invented
   endpoints, invented fields and tokens per task, by the margins set in Phase 0.
3. **SC3:** `diff` agrees with oasdiff on oasdiff's own test corpus at or above the Phase 0
   target, and every disagreement is explained in `bench/disagreements.json`.
4. **SC4:** Run over the published version history of 10 popular MCP servers, `diff` finds at least
   one breaking change that shipped without a major version bump.
5. **SC5:** Each new contract family lands as one adapter folder with zero lines changed in the
   core (`git diff --stat` on the PR).
6. **SC6:** Every leading metric in [`metrics.md`](./metrics.md) is measured on every PR, and every
   lagging metric weekly. Each one is a control band.
7. **SC7:** Every Quint model passes `--invariant=safety` in `models.yml`, and each package's
   oxmutate score is at or above its floor in `mutation-ratchets.json`.

## Open questions

Every question this intent raised is closed; each bullet keeps the question and points at its
answer. Pending actions (the upstream offer, the npm names) are tracked in [`phase0.md`](./phase0.md).

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
- Which MCP servers form the SC4 corpus? Decided:
  [`D-20261106-apicontract-mcp-corpus`](../../decisions/D-20261106-apicontract-mcp-corpus.md).
