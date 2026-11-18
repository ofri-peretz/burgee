# Design — corpus, grader, consumer harness

Intent: [`intent.md`](./intent.md). **Status:** approved, 2026-11-18.

---

## Requirements

- **R1** `benchmarks/apicontract/corpus/pins.json`: `[{ id, family, url, sha256, license }]`, sorted;
  `pins.ts --refresh <source>` regenerates entries for one source and prints the diff.
- **R2** `fetch.ts` downloads into `$APICONTRACT_CORPUS_CACHE` (default `~/.cache/apicontract-corpus`),
  verifies sha256, and is resumable.
- **R3** `corpus.ts --tool <ours:types|openapi-typescript|hey-api|…> --sample N --seed S` writes
  `results/<tool>.jsonl`, one line per document: `{ id, read, generate, typecheck: {ts59, ts60, ts70},
  roundtrip, ms, error }`.
- **R4** Incumbents are installed by `install.ts <pkg>@<version>` into a temp folder (npm, no lockfile
  write in the repo) and invoked through their own CLI or API.
- **R5** `consumers.ts --framework <name> --output <dir>` installs the framework and TypeScript
  versions, type-checks, and runs a boot script that exits 0 when the app starts and serves one route.
- **R6** `summary.ts` folds the jsonl files into `summary.md` and `summary.json` for the docs page.

## Design

Plain `tsx` scripts, no framework; each step a function with a `--json` output so CI and agents read
it. The TypeScript 7 binary is installed by R4 like any incumbent.

## Verification

`npx vitest run benchmarks/apicontract` covers the pure parts (pin parsing, sampling, summary
folding); `npx tsx benchmarks/apicontract/corpus.ts --sample 20 --tool ours:types` is the smoke run.

## Rejected alternatives

- **Committing the corpus.** Hundreds of MB, licences vary; pins with hashes are reproducible.
- **Grading only our own fixtures.** The fixtures we write pass; real documents are where generators fail.

## Out of scope

Hosting the results (the docs site renders them). Grading non-TypeScript generators.

## As built (2026-11-18, lane `ac-corpus`)

Where the build departs from the design above, and why. Each is a decision for review, not a silent change.

- **R1 file shape.** `pins.json` is grouped by source — `{ version, sources: { <name>: { family, repo,
  commit, license, documents: { <path>: <sha256> } } } }` — and `expandPins()` turns it into R1's
  `[{ id, family, url, sha256, license }]` rows. The flat form repeats the repo, commit and licence on
  5,418 lines; the grouped form is ~710 KB, one document per line, so a refresh diffs line by line.
  The URL is derived (`raw.githubusercontent.com/<repo>/<commit>/<path>`), so it cannot drift from
  the commit. Sources live in `corpus/sources.ts`.
- **Counts reached.** OpenAPI 4,265 (APIs.guru 4,138 at `f04b8d0`, Kubernetes 65, Twilio 60, Stripe 1,
  GitHub 1); AsyncAPI 52 (3.x 28, 2.6.0 24); JSON Schema 1,101 (SchemaStore 1,032, the test suite's 69
  validation files). The APIs.guru licence recorded is the directory's (CC0-1.0); each API's own terms
  still apply to its document.
- **MCP snapshots: a gap, not a pin.** No MCP server publishes a `tools/list` snapshot at a stable URL,
  so there is nothing to pin with a hash. Capturing the ten SC10 servers means running each one at a
  pinned version and recording its answer; that is a recorder (`mcp-snapshot.ts`), not a download, and
  is left for a follow-up. The `mcp` family exists in the pin schema so the snapshots slot in.
- **Results path.** `benchmarks/results/apicontract/` is outside this lane's paths, so runs land in
  `benchmarks/apicontract/results/<date>-<sha>/`. The integrator can move the default.
- **R3 `read` for incumbents is `null`.** An incumbent's CLI reads and generates in one step, so its
  `read` is not observable apart from `generate`; the summary prints "—" rather than guess. `roundtrip`
  is `null` for every row until a target ships an extractor.
- **R3 timing.** `ms` is the wall-clock of the process that turns one document into files, for every
  tool alike (ours runs through a small runner over the built `dist/`), so start-up is included on both
  sides. Type-checking runs one `tsc` per compiler over all outputs and attributes each error to its
  document's folder; a compiler crash with no diagnostic is `null`, never a verdict.
- **R5 boot contract.** Each framework names what it boots from the output (`app.module.ts` →
  `AppModule` for Nest, `index.ts` → `app` for Hono, `handlers.ts` → `handlers` for MSW, `server.ts`
  for MCP); TanStack Query is type-check only. On today's `main` only the `mcp` generator exists among
  these — `nest`, `hono`, `msw` and `tanstack-query` are stubs — so the intent's "boots one generated
  NestJS module" waits on the Nest generator. The harness itself boots a hand-written Nest module and a
  Hono app (checked locally, not committed).
- **Documents that are not self-contained.** Some APIs.guru documents `$ref` sibling files the
  directory does not contain (8 of the first 100 sampled). Every tool fails them; they stay in the
  corpus as written, because that is what users feed these tools.
