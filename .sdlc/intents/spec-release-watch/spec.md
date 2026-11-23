# Design — every contract specification apicontract reads is watched for new releases

Intent: [`intent.md`](./intent.md). **Status:** approved.

---

## Requirements

- **R1. The watch list.** `packages/contractdiff/specs.json`: an array of
  `{ name, repo, kind?: 'spec' | 'test-suite', source: 'releases' | 'tags', tagPattern?, reads: string[], seen?: { version, at } }`.
  `reads` names the versions apicontract's adapters accept (from `inputs.ts`), `seen` is the
  newest version the watch has recorded.
- **R2. The pass.** `compat-oracle --specs` reads every `packages/*/specs.json`, asks GitHub for each
  repo's releases (or tags matching `tagPattern`), and writes `packages/compat-oracle/specs-upstream.json`
  with one update per version newer than `seen`. Versions compare by the spec's own scheme:
  semver, or ISO dates for MCP.
- **R3. Pre-releases are separate.** A release marked `prerelease`, or a tag matching `rc|draft|beta`,
  is an update with `prerelease: true`.
- **R4. Issues.** A step in `compat-upstream.yml` opens one issue per update, titled
  `spec: <name> <version> released (we read <reads>)`, labelled `upstream-spec`, plus
  `upstream-spec-prerelease` for R3. The body links the release and names the adapter file that
  reads the format. Same exact-title dedupe as the other two passes.
- **R5. Record without noise.** `compat-oracle --specs --record` writes the newest version into
  `seen` for each spec and opens nothing. An entry with no `seen` is recorded, not reported, on any
  run (warn first: the first run never files a backlog).
- **R6. Coverage lock.** A test fails when a built-in adapter in `packages/contractdiff/src/inputs.ts`
  has no `specs.json` entry naming its format, or when a test suite a grader vendors has no
  `test-suite` entry.
- **R7. Rate and failure.** Requests use `GITHUB_TOKEN` when set; a repo that errors or is
  rate-limited is reported in the log and the step summary as unchecked, never as up to date.

## Design

`packages/compat-oracle/src/specs.ts` beside `competitors.ts`, reusing `watch.ts`'s update and
report shapes. GitHub is read with `fetch` (Node 20+, no dependency) on
`/repos/{repo}/releases?per_page=20` or `/repos/{repo}/tags?per_page=50`. The workflow gains one
step after `--competitors`, and one issue step copied from the competitor one with its own label.

Initial list (repos only; versions are recorded by the first `--record` run, not typed in):
OAI/OpenAPI-Specification, OAI/Overlay-Specification, OAI/Arazzo-Specification, asyncapi/spec,
json-schema-org/json-schema-spec, modelcontextprotocol/modelcontextprotocol, graphql/graphql-spec,
open-rpc/spec, cloudevents/spec, standard-schema/standard-schema, asyncapi/bindings,
protocolbuffers/protobuf, apache/avro, a2aproject/A2A, open-telemetry/semantic-conventions,
open-telemetry/opentelemetry-proto, and the test suite
json-schema-org/JSON-Schema-Test-Suite (an entry with `kind: 'test-suite'`, titled `suite:` in R4).

## Verification

- `npx vitest run packages/compat-oracle/src/specs.test.ts`, with `fetch` stubbed by fixture
  responses: R2 (one newer release → one update), R3, R5 (no `seen` → recorded, no update), R7
  (a 403 → unchecked), dedupe by re-run.
- `scripts/specs-coverage-lock.test.ts` for R6, proven by deleting one entry.

## Rejected alternatives

- **Dependabot or Renovate custom managers.** They open PRs bumping a version string; there is no
  version string to bump, the reaction is a design decision.
- **One central list in `compat-oracle`.** The format's owner should own its watch.

## Out of scope

- Reading the release notes to say which constructs changed. The issue links them; a person reads.
- Specs apicontract does not read or plan to read.
