# API-contract codegen landscape — 2026-11-18 snapshot

Method: GitHub numbers from `gh api repos/<r>` and `gh api search/issues` (pulled 2026-11-18). npm numbers from
`api.npmjs.org/downloads/point/...` and `npm view <pkg> time` (pulled 2026-11-18). Web claims carry their source link.
"unverified" = single secondary source or not checked against a primary.

**Caveat on downloads:** npm download counts inflated across the whole ecosystem in the last year. Control packages,
same week YoY (2025-11-10..16 vs 2026-11-09..15): zod 55.1M→462M (8.4x), typescript 101M→427M (4.2x),
@tanstack/react-query 12.4M→86.6M (7.0x), msw 7.2M→33.9M (4.7x), axios 72M→144M (2.0x). Compare growth *ratios
relative to these*, not raw multiples. Absolute numbers are mostly CI/agent installs, not humans.

## 1. Competitor table

GitHub `open_issues_count` includes open PRs. "Open issues" column below is that number unless noted.

| Project | npm pkg | Version | Last 5 releases (npm) | Stars | Open (issues+PRs) | Weekly dl (last-week) | YoY dl ratio | Plugin / extension model |
|---|---|---|---|---|---|---|---|---|
| Hey API | `@hey-api/openapi-ts` | 0.99.0 | 0.97.3 2026-05-25, 0.98.0 06-01, 0.98.1 06-01, 0.98.2 06-08, **0.99.0 2026-06-22 (none since; `next` tag last 2026-09-30)** | 5,590 ([hey-api/hey-api](https://github.com/hey-api/hey-api)) | 679 (561 issues + 118 PRs) | 7,686,706 | 9.9x | `plugins: []` in config; first-party plugin per target (sdk, zod, tanstack-query, nest, …) on a shared `@hey-api/codegen-core`; custom plugins via plugin API |
| Orval | `orval` | 8.48.0 | 8.44.0 2026-10-21, 8.45.0 10-25, 8.46.0 10-30, 8.47.0 11-07, 8.48.0 11-14 (≈weekly) | 6,631 | 21 | 3,962,786 | 7.8x | `client:` enum of built-in generators (axios, fetch, react/vue/svelte-query, swr, angular, zod, valibot, effect, hono, mcp, pinia-colada, solid-start) + `override` mutators/transformers; no third-party plugin registry |
| Kubb | `@kubb/core` (`@kubb/cli`) | 5.21.1 | 5.20.1 2026-11-14, 5.20.2 11-15, 5.20.3 11-16, 5.21.0 11-16, 5.21.1 11-17 (≈daily). 5.0.0 on 2026-08-17 | 1,846 | 8 | 580,279 (cli 416,617) | 8.2x | Adapter (`adapter-oas`) → AST → plugins (`kubb/kit`: plugins, generators, resolvers, JSX renderer); plugins moved to [kubb-labs/plugins](https://github.com/kubb-labs/plugins) |
| OpenAPI Generator | `@openapitools/openapi-generator-cli` | 2.42.2 (wrapper) | 2.40.1 2026-07-24, 2.41.0 08-24, 2.42.0 10-20, 2.42.1 11-09, 2.42.2 11-11 | 26,861 | 5,863 | 2,091,436 | 2.4x | Java; Mustache template overrides or custom generator JAR |
| openapi-typescript | `openapi-typescript` | 7.13.0 | 7.9.1 2025-08-11, 7.10.0 10-14, 7.10.1 10-15, 7.12.0 2026-02-08, 7.13.0 2026-02-11 | 8,441 | 287 | 17,261,909 | 9.4x | None; Node API `transform`/`postTransform` hooks |
| openapi-fetch | `openapi-fetch` | 0.17.0 | 0.14.1 2025-10-02, 0.15.0 10-14, 0.15.2 2026-02-08, 0.16.0 02-08, 0.17.0 02-11 | (same repo) | — | 18,200,794 | 11.3x | Middleware (`client.use`) at runtime; **maintenance mode since 2025-12-29** ([roadmap #2559](https://github.com/openapi-ts/openapi-typescript/discussions/2559)) |
| typed-openapi | `typed-openapi` | 4.1.0 | 3.3.0 2026-08-17, 3.3.1 08-18, 4.0.0 08-19, 4.0.1 08-28, 4.1.0 09-16 | 403 | 3 | 126,899 | 8.4x | None; `--runtime` flag picks validator (zod/valibot/arktype/typebox/…) |
| openapi-zod-client | `openapi-zod-client` | 1.18.3 | 1.17.0 2024-04-11, 1.18.0 04-13, 1.18.1 04-18, 1.18.2 07-31, **1.18.3 2025-02-10 (stale 21 months)** | 1,177 | 108 | 344,845 | 2.5x | Handlebars template override |
| TypeSpec | `@typespec/compiler` | 1.18.0 | 1.14.0 2026-07-14, 1.15.0 08-11, 1.16.0 09-09, 1.17.0 10-08, 1.18.0 11-11 (monthly) | 5,947 | 1,073 | 431,501 | 2.2x | Emitters (npm packages) + decorator libraries |
| Fern | `fern-api` | 5.222.1 | 5 releases all on 2026-11-17 (multiple/day) | 3,839 | 205 | 282,990 | 4.5x | Generators as versioned Docker images in `generators.yml`, over Fern IR; Apache-2.0. **Acquired by Postman 2026-01-08** ([pulse2](https://pulse2.com/postman-acquires-fern-to-expand-api-documentation-and-sdk-capabilities)) |
| Speakeasy | (Go binary; no npm CLI) | gen v2.965.0 | v2.964.0–v2.965.0 all 2026-11-17 ([releases](https://github.com/speakeasy-api/openapi-generation/releases)) | 461 (CLI repo) / 37 ([openapi-generation](https://github.com/speakeasy-api/openapi-generation), created 2026-09-10) | 18 | n/a | n/a | Overlays + SDK hooks + custom code regions. **Generator open-sourced AGPL-3.0 on 2026-09-17 with Google** ([Google blog](https://developers.googleblog.com/why-client-sdk-generation-belongs-in-the-open/), [Speakeasy](https://www.speakeasy.com/blog/partnering-with-google)) |
| Stainless | `@stainless-api/sdk` (API client only) | 0.5.0 | 0.1.0 2026-02-19 … 0.5.0 2026-03-03 | 25 ([stainless-api-cli](https://github.com/stainless-api/stainless-api-cli)) | 2 | 2,216 | n/a | Hosted `stainless.yml` + git-merged custom code. **Acquired by Anthropic 2026-05-18; hosted generator wound down, no new signups** ([Anthropic](https://www.anthropic.com/news/anthropic-acquires-stainless), [Scalar summary, Sep 2026](https://scalar.com/resources/stainless-wind-down)). No OSS generator |

### Health signals (the ones that matter more than stars)

- **Hey API has stalled.** No stable release since 2026-06-22, last commit on `main` 2026-09-30 (`gh api repos/hey-api/hey-api/commits`).
  On 2026-08-24 it added "fund a feature" to every issue template: *"While votes indicate interest, funding pays for the work"* and
  a [heyapi.dev/sponsors](https://heyapi.dev/sponsors) tier page (commit "chore: ask about funding where a request is made", #4380).
  Single-maintainer model (Lubos), chose no VC ([GitHub Sponsors](https://github.com/sponsors/mrlubos)). 223 new issues since 2026-05-17
  are going largely unanswered (561 open). It is the download leader among full generators and is currently not shipping.
- **openapi-typescript/openapi-fetch**: fetch/react-query clients put in maintenance mode 2025-12-29; kerwanp stepping down; last release
  2026-02-11; a community fork and an alternative ("openapi-shape", 2026-10-24) already appearing in the thread ([#2559](https://github.com/openapi-ts/openapi-typescript/discussions/2559)).
  18M weekly downloads with no active owner.
- **Orval** is community-run and fast: 400 issues opened since 2026-05-17, only 21 open. Top committers since 2026-09-01 are six
  different people (artnikbrothers, rvitaliy, melloware, soartec-lab…) — bus factor is healthy. Ships weekly.
- **Kubb** is one maintainer amplified by agents: contributors are stijnvanhulle 5,705 commits, `claude` 1,009, `Copilot` 756.
  Ships daily. Repo has `AGENTS.md`, `AI_POLICY.md`, `.claude-plugin`, `.codex`, `context7.json`.
- **Commercial consolidation**: Fern → Postman (Jan 2026), liblab → Postman (Nov 2025, per Scalar page, unverified elsewhere),
  Stainless → Anthropic (May 2026, hosted product closed), Speakeasy → AGPL open source (Sep 2026). The paid hosted SDK-generator
  category is collapsing into platforms or going open.

## 2. What users are asking for (top 👍 issues)

### Hey API — open, by 👍 ([search](https://github.com/hey-api/hey-api/issues?q=is%3Aissue+is%3Aopen+sort%3Areactions-%2B1-desc))

| 👍 | # | Opened | Title |
|---|---|---|---|
| 372 | [1486](https://github.com/hey-api/hey-api/issues/1486) | 2024-12-20 | MSW plugin |
| 180 | [2082](https://github.com/hey-api/hey-api/issues/2082) | 2025-05-28 | Effect client |
| 154 | [1483](https://github.com/hey-api/hey-api/issues/1483) | 2024-12-20 | Hono plugin |
| 129 | [1485](https://github.com/hey-api/hey-api/issues/1485) | 2024-12-20 | Faker plugin |
| 119 | [1479](https://github.com/hey-api/hey-api/issues/1479) | 2024-12-20 | SWR plugin |
| 104 | [1480](https://github.com/hey-api/hey-api/issues/1480) | 2024-12-20 | Zustand plugin |
| 98 | [3909](https://github.com/hey-api/hey-api/issues/3909) | 2026-05-18 | TanStack Start plugin |
| 73 | [1473](https://github.com/hey-api/hey-api/issues/1473) | 2024-12-19 | Arktype plugin |
| 60 | [1484](https://github.com/hey-api/hey-api/issues/1484) | 2024-12-20 | Express plugin |
| 55 | [558](https://github.com/hey-api/hey-api/issues/558) | 2024-05-12 | Transform case for generated types |

Next tier: OpenAPI 3.2 (51, [#2660](https://github.com/hey-api/hey-api/issues/2660)), Yup (48), TypeBox (48), TypeScript 7 support (46, [#4235](https://github.com/hey-api/hey-api/issues/4235), 2026-07-09),
Playwright plugin (27, [#4310](https://github.com/hey-api/hey-api/issues/4310)), Ajv (25), custom TanStack queryKey (21), **multi-file types output (21, [#1274](https://github.com/hey-api/hey-api/issues/1274))**,
AdonisJS (17), Supertest/Nock (12 each), `throwOnError` loses HTTP status (11), 3.1 parser drops `$ref`+composition arrays (11, [#4412](https://github.com/hey-api/hey-api/issues/4412)).
Already shipped (closed-completed): Nest plugin (137 👍), Next.js client (68), Zod plugin (65).
Closed-not-planned has no signal (max 6 👍: camelCase not mapped back to snake_case on the wire, [#1623](https://github.com/hey-api/hey-api/issues/1623); separate files for types/classes, [#357](https://github.com/hey-api/hey-api/issues/357)).

### Orval — few open issues (aggressive triage), so all-state top by 👍

| 👍 | # | State | Title |
|---|---|---|---|
| 19 | [243](https://github.com/orval-labs/orval/issues/243) | done | Customize default query keys |
| 15 | [886](https://github.com/orval-labs/orval/issues/886) | done | ESM support |
| 15 | [1454](https://github.com/orval-labs/orval/issues/1454) | done | Bun schema compilation fails |
| 14 | [839](https://github.com/orval-labs/orval/issues/839) | done | Zod param validation inside TanStack query fns |
| 13 | [2915](https://github.com/orval-labs/orval/issues/2915) | done (2026) | Valibot support |
| 11 | [289](https://github.com/orval-labs/orval/issues/289) | done | File/dir name transformer |
| 10 | [2535](https://github.com/orval-labs/orval/issues/2535) | done | Zod generator produces large monolithic schemas |
| 9 | [1222](https://github.com/orval-labs/orval/issues/1222) | **not planned** | Branded types / replace types with custom ones |
| 8 | [1432](https://github.com/orval-labs/orval/issues/1432) | **not planned** | Customize date data type |
| 7 | [885](https://github.com/orval-labs/orval/issues/885) | **not planned** | Global headers from securitySchemes |

Open now: TanStack Query v6 (7 👍, [#4030](https://github.com/orval-labs/orval/issues/4030)); zod `schemaExtension` imports; mark read-only POSTs as queries; `useBrandedTypes` no effect on reusable zod schemas.
Other not-planned: MSW generator as a standalone tool ([#781](https://github.com/orval-labs/orval/issues/781)), reduce dependencies ([#727](https://github.com/orval-labs/orval/issues/727)), MSW intercept passthrough, request params in mocks.

### Kubb — only 6 open issues; all-state top

| 👍 | # | State | Title |
|---|---|---|---|
| 7 | [2003](https://github.com/kubb-labs/kubb/issues/2003) | done | Roadmap v5 |
| 6 | [1849](https://github.com/kubb-labs/kubb/issues/1849) | **not planned** | Valibot support |
| 5 | [1721](https://github.com/kubb-labs/kubb/issues/1721) | done | Zod 4 |
| 4 | [3629](https://github.com/kubb-labs/kubb/issues/3629) | open | AsyncAPI adapter |
| 4 | [1904](https://github.com/kubb-labs/kubb/issues/1904) | done | react-query mutation return type |
| 3 | [1669](https://github.com/kubb-labs/kubb/issues/1669) | done | Discriminator parsing crash |
| 3 | [1917](https://github.com/kubb-labs/kubb/issues/1917)/[1930](https://github.com/kubb-labs/kubb/issues/1930) | done | Self-referential types in zod/faker (stack overflow) |
| 2 | [3631](https://github.com/kubb-labs/kubb/issues/3631) | open | Arazzo workflow adapter |
| 2 | [1786](https://github.com/kubb-labs/kubb/issues/1786) | not planned | Types from multiple sources |
| 1 | [4450](https://github.com/kubb-labs/kubb/issues/4450) | open | Webhooks & callbacks types |

Also open: Prisma adapter, multiple specs sharing a dependent spec emit duplicate outputs ([#3660](https://github.com/kubb-labs/kubb/issues/3660)).

### Themes (weighted by 👍; hey-api dominates the signal because it uses 👍 as its roadmap vote)

| Theme | Evidence | Weight |
|---|---|---|
| **Mocks/test tooling** (MSW, Faker, Playwright, Supertest, Nock; standalone mocks) | hey-api 372+129+27+12+12; orval #781, #1668, #422 | Highest by far |
| **Server targets** (Hono, Express, Nest, Adonis, TanStack Start) | hey-api 154+60+137(done)+17+98 | High |
| **Validator plurality** (Zod 4, Valibot, Arktype, Yup, TypeBox, Ajv; Standard Schema) | hey-api 73+48+48+25; orval #2915; kubb #1849, #1721; typed-openapi builds its whole pitch on it | High |
| **Effect ecosystem** | hey-api #2082 (180); orval already ships `packages/effect` | High, single ask |
| **Query-lib coverage & keys** (SWR, Zustand, TanStack v6, custom queryKey) | hey-api 119+104+21; orval #243, #4030 | Medium |
| **Type customization** (casing transform both ways, branded types, date types, null/optional) | hey-api #558, #1623, #549; orval #1222, #1432, #1939 | Medium, chronically under-served (orval closed as not-planned) |
| **Output layout** (multi-file types, split zod, barrel) | hey-api #1274, #357; orval #2535, #289 | Medium |
| **Spec coverage correctness** (OAS 3.2, 3.1 `$ref`+composition, discriminators, recursion, webhooks/callbacks, multipart) | hey-api #2660, #4412; kubb #1669, #1917, #4450, #4082 | Medium, constant bug stream |
| **Toolchain compat** (TS 7/tsgo, Bun, ESM, Node 22+) | hey-api #4235, #2531; orval #886, #1454 | Medium, spiky after each TS/runtime release |
| **Multi-spec / monorepo** | kubb #1786, #3660; hey-api "multiple clients under a single config" discussion #444 | Low-medium |
| **Other specs** (AsyncAPI, Arazzo, Postman, Prisma) | kubb #3629, #3631, #3630; hey-api "Postman Collection support" 2026-11-15 | Low but rising |
| **Regeneration safety / custom code survival** | No top-voted OSS issue; it's the main selling point of Speakeasy/Stainless/Fern (custom code regions, git merge) | unverified as an OSS demand |
| **Perf** | No top-voted issue on any of the three | Not a user pain at current spec sizes (unverified for very large specs) |

## 3. Adoption drivers — last 12 months

Relative growth (YoY ratio ÷ zod's 8.4x): openapi-fetch 1.35, hey-api 1.18, openapi-typescript 1.12, typed-openapi 1.00, kubb 0.98,
orval 0.93; laggards openapi-generator-cli 0.29, openapi-zod-client 0.30, TypeSpec 0.26. Orval added the most absolute
downloads among full generators (+3.4M/wk). The three below are the growing, actively-chosen generators (openapi-fetch grows on inertia while unmaintained).

**Hey API** (growth peaked while it shipped; momentum now at risk)
- **Vote-driven public roadmap**: on 2024-12-19/20 it opened one issue per future plugin (#1473–#1488) and asks users to 👍; these are now the top-10. Turns demand into visible social proof.
- **Logos + named endorsement**: README/npm page cites Vercel, OpenCode, PayPal (and AWS, Autodesk) users and a quote from Vercel's CEO ([ecosyste.ms mirror](https://packages.ecosyste.ms/registries/npmjs.org/packages/@hey-api/openapi-ts)); Vercel + openstatus sponsorship announced 2025-10-28 (Bluesky, via [lightnews](https://oauth.lightnews.app/bsky/heyapi.dev)) — unverified primary.
- **Framework packaging**: dedicated `packages/nuxt` (Nuxt module), `packages/vite-plugin`, Next.js client (68 👍, shipped), Nest plugin (137 👍, shipped), TanStack Query plugin. Verified from repo layout.
- **Real-world spec corpus as tests**: added Vercel v0 (2026-08-04), Val Town (08-11), Anthropic (08-13) specs as fixtures — "works on the spec you actually use".
- **Expanding beyond TS**: `packages/openapi-python` (PyPI) — same brand, second language.
- **Sponsored-feature funding** (2026-08-24): issue templates ask "would your team fund this?" — a monetization tactic, coincides with shipping stopping.

**Orval** (biggest absolute adds; community velocity)
- **Breadth of first-class targets that hey-api users are still voting for**: Effect, Valibot, Hono server, MCP server, SWR, Angular, Pinia Colada, Solid Start, MSW mocks — all as packages in the repo today (`packages/`). Every top hey-api ask except Express/Zustand is already shipped in Orval.
- **MCP server generation** (`client: 'mcp'`, [orval.dev/guides/mcp](https://orval.dev/guides/mcp)), iterated through 8.8/8.15/8.20 (output schemas, annotations, titles) per [newreleases.io](https://newreleases.io/project/npm/orval/release/8.15.0) — unverified against GitHub release pages.
- **Agent onboarding**: repo ships `skills/`, `.claude-plugin`, `AGENTS.md`, `ARCHITECTURE.md`, `DEBUGGING.md`; skill listed on several agent-skill indexes ([skillsmp](https://skillsmp.com/skills/orval-labs-orval-skills-orval-skill-md)).
- **Zod 4 default** (8.19) and Node 22 baseline — staying current with the stack.
- **Triage discipline**: 400 issues in 6 months, 21 open; weekly releases; multiple active maintainers.

**Kubb** (small base, fast cadence, agent-first)
- **v5 re-architecture (5.0.0 on 2026-08-17)**: spec adapters (`adapter-oas`; proposed AsyncAPI, Arazzo, Prisma) → AST → plugins, plus `kubb/kit` authoring SDK — positions it as a platform rather than a generator.
- **Agent distribution**: Claude Code plugin marketplace (`/plugin marketplace add kubb-labs/kubb`), built-in MCP server (`npx kubb mcp`), `kubb agent start` HTTP code-gen server, skills on tessl/smithery ([skillselion](https://skillselion.com/skills/kubb-labs/kubb/tools/claude)); `context7.json` for doc retrieval.
- **Kubb Studio** (`packages/studio`) — visual/inspection UI (details unverified).
- **AI-scaled maintenance**: ~1,765 bot/agent commits; daily patch releases close bugs within days (recursion, discriminators, multipart).
- **unplugin-kubb**: runs inside Vite/Webpack/Rollup builds.

## 4. New entrants / moves in 2026 you may not know

| Who | What | Date | Source |
|---|---|---|---|
| Speakeasy `openapi-generation` | Full generator (7 SDK langs + CLI + MCP server gen) open-sourced, **AGPL-3.0**, commercial license token for proprietary use; Google ships its GenAI SDKs on it | 2026-09-17 (repo created 09-10; 37⭐) | [Google](https://developers.googleblog.com/why-client-sdk-generation-belongs-in-the-open/), [GitHub](https://github.com/speakeasy-api/openapi-generation) |
| Anthropic ← Stainless | Hosted Stainless generator closed to new signups; existing users keep code, lose regeneration (no end date published as of 2026-09-26) | 2026-05-18 | [Anthropic](https://www.anthropic.com/news/anthropic-acquires-stainless), [Scalar](https://scalar.com/resources/stainless-wind-down) |
| `stainful` | MIT, `stainless.yml`-compatible drop-in generator; Python-only at v0.4.0, <100⭐ | 2026 | [PyPI](https://pypi.org/project/stainful/) (unverified beyond listing) |
| WorkOS `oagen` | MIT framework for building custom SDK generators from OpenAPI; 82⭐ | repo created 2026-03-04 | [GitHub](https://github.com/workos/oagen) |
| Postman ← Fern | Fern stays Apache-2.0; "Fern Agent" launched Aug 2026 (unverified) | 2026-01-08 | [pulse2](https://pulse2.com/postman-acquires-fern-to-expand-api-documentation-and-sdk-capabilities) |
| APIMatic | Published a Stainless migration guide | 2026-06 | via [Scalar](https://scalar.com/resources/stainless-wind-down) (unverified) |
| openapi-nexus | Rust-implemented generator (TS fetch + Rust clients), Apache-2.0, beta, 92⭐ | repo 2025-10-25 | [GitHub](https://github.com/rust-codegen-group/openapi-nexus) |
| openapi-shape | Community alternative to openapi-fetch | 2026-10-24 | [#2559 thread](https://github.com/openapi-ts/openapi-typescript/discussions/2559) (unverified) |
| Scalar | 16.4k⭐ platform; ships parser/upgrader/validator packages at 5–13M dl/wk and markets itself as an SDK generator (Stainless replacement) | ongoing | [scalar/scalar](https://github.com/scalar/scalar) |
| Hey API Python | `@hey-api/openapi-python` — same generator, Python output | 2026 (date unverified) | repo `packages/openapi-python` |

Not found: a new Rust/oxc-speed TypeScript-output generator with traction (searched 2026-11-18; none).

## Decision-relevant implications (analyst's read, not sourced)

1. The download leader (hey-api) and the 18M/wk runtime client (openapi-fetch) are both effectively unmaintained right now. A credible migration path from each (config codemod + parity tests on their own fixtures) is the largest available adoption lever.
2. Users' top asks are *targets*, not core features: mocks (MSW/Faker), servers (Hono/Express/Nest), validators (Valibot/Arktype/Effect). A plugin model where a third party can ship one of these without core changes answers the whole top-10 at once. Orval shows breadth wins; Kubb shows a kit/SDK wins contributors.
3. MCP-server generation and agent distribution (skills, Claude plugin, built-in MCP) are now table stakes — Orval, Kubb, Speakeasy, Stainless all have it.
4. Regeneration safety / custom-code survival is the commercial tools' moat and has no OSS answer; Stainless refugees need it now.
5. Speakeasy AGPL changes the "OSS vs. commercial" axis: we compete on licence (MIT, zero deps) and TS-native extensibility, not on "open".
