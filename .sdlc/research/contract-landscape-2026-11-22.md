# Contract tooling across open formats, and what agents need — 2026-11-22

> Read 2026-11-22 by four parallel web reviews (OpenAPI family; events and schema registries; RPC,
> GraphQL, MCP and A2A; JSON Schema, OpenTelemetry and agent-facing CLI practice), for the open-formats
> decision ([`D-20261122-open-formats`](../decisions/D-20261122-open-formats.md)). Extends
> [`../intents/apicontract/landscape.md`](../intents/apicontract/landscape.md) (2026-11-06), which ranked
> 46 JS/TS packages by downloads and stays the source for OpenAPI generator popularity.
>
> **Evidence quality.** Most rows came from docs and release pages; several from search snippets only.
> Popularity numbers were not re-measured here and are omitted rather than guessed. Every claim below
> carries its source; "not verified" means exactly that. A claim that a vendor was acquired (one article)
> is left out.

## What to take, by family

| Family | Incumbent | Capability worth taking | Source |
|---|---|---|---|
| Events / registries | Confluent Schema Registry | BACKWARD / FORWARD / FULL **and `_TRANSITIVE`**: plain modes check the latest version only, transitive modes check every prior version | [docs](https://docs.confluent.io/platform/8.0/schema-registry/fundamentals/schema-evolution.html) |
| Events / registries | Apicurio Registry | Rules at artifact → group → global level, all must pass | [docs](https://docs.redhat.com/en/documentation/red_hat_build_of_apicurio_registry/3.0/html/apicurio_registry_user_guide/intro-to-registry-rules_registry) |
| Events / registries | AWS Glue | `DISABLED` mode: a schema that may not evolve at all | [docs](https://docs.aws.amazon.com/glue/latest/dg/schema-registry.html) |
| Protobuf | buf | Breaking-change **categories** FILE ⊃ PACKAGE ⊃ WIRE_JSON ⊃ WIRE (source → wire compatibility); baseline from git, registry or archive | [rules](https://buf.build/docs/breaking/rules/) |
| GraphQL | GraphQL Inspector | Three severities (breaking, **dangerous**, non-breaking); `considerUsage` makes a removal safe if unused; `dangerousBreaking` promotes | [diff](https://the-guild.dev/graphql/inspector/docs/essentials/diff) |
| GraphQL | GraphQL Hive | Schema checks report **affected app deployments**; approvals through merge queue | [update](https://the-guild.dev/graphql/hive/product-updates/2025-12-10-schema-checks-affected-app-deployments) |
| MCP | mcpdiff, mcp-lint, mcpvet | Snapshot `tools/list`, diff as breaking / warning / safe, exit 1 on breaking; cross-client schema lint | [mcp-lint](https://socket.dev/npm/package/mcp-lint), [drift post](https://dev.to/nesquikm/my-mcp-tools-broke-silently-schema-drift-is-the-new-dependency-hell-5c49) |
| JSON Schema | Bowtie | Public cross-implementation **compliance matrix**; stdin/stdout harness any implementation can join | [intro](https://json-schema.org/blog/posts/bowtie-intro) |
| JSON Schema | Sourcemeta jsonschema | Lint, bundle, and **unit-test a schema against instances** from the CLI | [releases](https://github.com/sourcemeta/jsonschema/releases) |
| OpenTelemetry | Weaver | **Policy-based governance** (Rego) on the registry and on live telemetry (`live-check`), finding filters, a report endpoint for CI | [releases](https://github.com/open-telemetry/weaver/releases) |
| OpenAPI | Redocly | One CLI for lint, diff, bundle, Arazzo (Respect); Redoc 3 renders OpenAPI 3.2, AsyncAPI, GraphQL, MCP | [blog](https://redocly.com/blog/category/redocly) |
| OpenAPI | Speakeasy | OpenAPI → MCP tools with an extension to shape them | [guide](https://www.speakeasy.com/mcp/tool-design/generate-mcp-tools-from-openapi) |
| Catalog | EventCatalog | Built-in **MCP server** over the event catalog (15 tools) | [post](https://eventcatalog.dev/blog-2/built-in-mcp-server) |
| Specs | Overlay 1.1, Arazzo 1.1 | Arazzo 1.1 chains workflows and takes AsyncAPI sources | [OAI](https://www.openapis.org/blog/2026/06/09/openapi-initiative-newsletter-june-2026) |

## What agents need that no tool gives today

Each was reported by at least one review with a source; together they are the agent-first backlog.

1. **One policy across formats.** buf, GraphQL Inspector, registries and MCP diff tools each have their
   own lint, diff and severity scale; no single policy covers protobuf, GraphQL, events and MCP.
   ([buf](https://buf.build/docs/breaking/rules/), [Spectral AsyncAPI v3 gap](https://github.com/stoplightio/spectral/pull/2697))
2. **A reason per field, not pass/fail.** Registries answer compatible or not.
   ([Confluent](https://docs.confluent.io/platform/8.0/schema-registry/fundamentals/schema-evolution.html))
3. **"Would this pass?" without writing.** Apicurio's rules run only on write.
   ([Apicurio](https://docs.redhat.com/en/documentation/red_hat_build_of_apicurio_registry/3.0/html/apicurio_registry_user_guide/intro-to-registry-rules_registry))
4. **Approval state an agent can read.** Governance workflows document human review, not an API for it.
   ([buf](https://buf.build/blog/review-governance-workflow))
5. **Usage-aware severity for agent tools.** Hive does it for GraphQL; nothing does it for MCP.
6. **Typed clients from MCP `tools/list`.** No generator found
   ([connect-es](https://buf.build/blog/connect-es-v2) is the protobuf analogue).
7. **Operation selection for spec → MCP.** One tool per operation floods context; practitioners prune
   by hand. ([TowardsAI](https://pub.towardsai.net/openapi-to-mcp-server-how-to-turn-rest-apis-into-reliable-ai-tools-without-tool-bloat-8d4d695ca0d4), [Cloudflare Code Mode](https://blog.cloudflare.com/code-mode-mcp/))
8. **Spec quality scored for agents**, not only for conformance: incomplete descriptions are what break
   generated tools. ([arXiv 2507.16044](https://arxiv.org/html/2507.16044v3))
9. **A contract that spans envelope and payload** (a CloudEvent carrying a versioned schema).

**What agents need from any CLI** ([clig.dev](https://clig.dev), [Poehnelt](https://justin.poehnelt.com/posts/rewrite-your-cli-for-ai-agents/), [Arcjet](https://blog.arcjet.com/designing-a-cli-for-ai-agents/), [gh evaluation](https://cli-agent-spec.github.io/evaluations/gh/report-agent-dev/)):
JSON on stdout and diagnostics on stderr; documented exit codes; structured dry runs; fix suggestions;
a schema or capabilities command instead of parsing `--help`; idempotent commands; pagination and
truncation metadata; an MCP mode with the CLI as source of truth; confirmation for destructive actions.
llms.txt is weak evidence ([Ahrefs](https://www.ahrefs.com/blog/llmstxt-study/)): low priority.

## Where we stand, and what it changes

| Need | Today | Change |
|---|---|---|
| 1 one policy | `diff` and `lint` run on one model for every adapter | Keep; it is the wedge |
| 2 reason per field | `diff` findings carry pointer, before/after, `fix:` | Keep |
| 3 dry run | `diff` and `lint` never write | Keep; say so in docs |
| 4 approval state | decision markers (`apicontract-diff-decisions`) | Keep; `--json` exposes them |
| Transitive compatibility | `diff` compares two versions | **Add** `--transitive <ref-range>`: check against every release in a range |
| buf-style categories | `--mode` / `--side` | **Add** a wire vs source level for protobuf when it is read |
| Dangerous severity | breaking / unknown / non-breaking | **Add** `dangerous` (e.g. new enum value for an exhaustive reader) |
| 5 usage-aware | none | **Add** `--usage <file>`: a call log or map that makes an unused removal safe |
| 6 typed MCP clients | `gen` from MCP (typed `callTool`) | Keep; publish it |
| 7 operation selection | `gen mcp` maps every operation | **Add** selection by tag / `x-mcp` with a size budget |
| 8 agent-quality lint | none | **Add** a `lint` ruleset scoring descriptions for tool use |
| Compliance matrix | corpus scoreboard | **Join** Bowtie with our validator |
| Policy governance | `lint` rules as plugin data | Learn from Weaver's live-check for runtime |
| CLI for agents | every command is a burgee declaration: `--json`, `--schema`, MCP, completions, exit codes | Keep; check pagination/truncation metadata in burgee's JSON |

## Every CLI on burgee

Product CLIs are burgee programs: apicontract (to be contractdiff), oxmutate and compat-oracle already
are, and any new one starts there, so every capability in the last row above is inherited, not rebuilt.
The foundation packages burgee is built from (roundel, linegauge, closeout, seniority, bellpull) cannot
depend on it; proposed: they, and the other zero-dependency foundation packages, are exempt, and their
small CLIs stay as they are. **Owner to confirm.**
