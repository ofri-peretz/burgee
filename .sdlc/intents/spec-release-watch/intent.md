# Intent — every contract specification apicontract reads is watched for new releases

> Raised by the owner on 2026-11-22: "we need somehow to constantly track new releases by all famous
> specs". Extends the daily upstream watch ([`../upstream-watch/`](../upstream-watch/),
> [`../foundation-claims-watched/`](../foundation-claims-watched/)), which already does this for npm
> packages we are compatible with or measured against, but not for the specifications themselves.

**Status:** draft · **Opened:** `2026-11-22` · **Owner:** `@ofri-peretz` · **Lane:** `ac-inputs`

---

## What is wanted

The day a contract specification publishes a new version, an issue in this repository says so,
names the version apicontract reads today, and links the release notes. Specifications in scope
are every format apicontract reads or plans to read:

- OpenAPI (OAI/OpenAPI-Specification), Overlay (OAI/Overlay-Specification), Arazzo
  (OAI/Arazzo-Specification);
- AsyncAPI (asyncapi/spec);
- JSON Schema (json-schema-org/json-schema-spec);
- Model Context Protocol (modelcontextprotocol/modelcontextprotocol, dated versions);
- GraphQL (graphql/graphql-spec), OpenRPC (open-rpc/spec), CloudEvents (cloudevents/spec);
- Standard Schema (standard-schema/standard-schema), which our validator implements.

Pre-releases (release candidates, drafts) are tracked too, as their own issues, labelled so
they can be read early but not mistaken for a release.

## Why now

- apicontract reads five formats and plans more. The npm watch would notice a new
  `openapi-typescript`, but not a new OpenAPI. A spec release is where a reader goes stale: OpenAPI
  3.2 and MCP's dated revisions each added constructs a reader has to accept.
- The machinery exists: a daily job, one issue per (thing, version), deduped by title. This is
  a third pass on it, not a new system.

## Constraints

- Packages, never services: the watch list is a committed JSON file, read by `compat-oracle`
  like `competitors.json`. No external tracker.
- Zero new dependencies. GitHub's REST API with the job's token; no scraping of web pages.
- One issue per (spec, version), never duplicated; the same dedupe as the other two passes.
- The list is owned by the package that reads the format (`packages/apicontract/specs.json`), so a
  format added to apicontract adds its watch in the same PR (intent constraint 5 of
  `upstream-watch`: data a package owns, not a central table).
- New checks warn first: the first run records every spec's current version without opening
  issues.

## Success criteria

- A planted watch list with one spec at an old recorded version produces exactly one update with
  the right title; re-running produces none (dedupe).
- The live list covers every format `apicontract` reads today (a lock test compares it with the
  built-in adapters' names).
- The first scheduled run after merge opens no issues and records the current versions.

## Rejected

- **Watching the specs' websites or RSS.** Not every spec has a feed; every one publishes on GitHub.
- **Opening a PR that updates the adapters.** A new spec version is a design question (which
  constructs, which defaults), not a mechanical bump.
