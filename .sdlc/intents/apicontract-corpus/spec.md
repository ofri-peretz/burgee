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
