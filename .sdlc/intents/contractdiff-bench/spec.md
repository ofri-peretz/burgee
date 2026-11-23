# Design — contractdiff against its competitors, measured on one corpus

Intent: [`intent.md`](./intent.md). **Status:** approved.

---

## Requirements

- **R1. The catalogue** (`benchmarks/apicontract/diff-edits.ts`). Each edit is a pure function from
  an OpenAPI 3.x document to a changed copy, or `undefined` when the document has nowhere to apply it,
  with `id`, `label` (`breaking` | `non-breaking`, for old callers) and `why`. Breaking: an operation
  removed, a required request parameter added, a request body made required, a request property made
  required, a request property's type changed, an enum value removed from a request, a required
  response property removed, a required response property's type changed, a path parameter renamed,
  a success status removed, a security requirement added. Non-breaking: an operation added, an
  optional request parameter added, an optional request property added, a request property made
  optional, an enum value added to a request, a response property added, a description changed, an
  example changed, an operation deprecated. An edit reaches a schema only through a copy inlined at
  the operation it changes, so a request edit never also changes a response sharing the `$ref`.
- **R2. The pairs** (`diff-pairs.ts`). `--sample N --seed S` takes N pairs: the pinned OpenAPI 3.x
  documents in a seeded order, one edit each, the edits in turn (the next one that applies when a
  document has nowhere for its turn's), so labels stay near half and half. No `--sample`: every edit
  on every document. Plus the timing pairs: three edits on the Stripe and GitHub specs, the largest
  pinned (`pins.json` holds one commit per source, so two adjacent releases are not pinned). Written
  to the cache folder, never the repo.
- **R3. The runners** (`diff-tools.ts`). One adapter per tool, installed at its pin into a temporary
  folder: npm packages through `install.ts`, oasdiff through `go install` at an exact tag (the Go
  checksum database pins its bytes). Each differ is asked the backward-compatibility question and
  read the way its own CI integration reads it: oasdiff `breaking --fail-on ERR`, openapi-diff's
  exit code with "Breaking changes found", optic `diff --check`, contractdiff `diff --json`
  (`unknown` fails a run as `breaking` does, so it counts as one). Anything else it prints is a
  `crash`. contractdiff runs from this checkout's build. Spectral and Redocly run once on each
  document and report time and crash only. A run past `--timeout` (default 120 s) is killed with
  SIGKILL and counted as a crash.
- **R4. The reading** (`diff-bench.ts`). One JSONL row per pair and tool, and `summary.json` and
  `summary.md`: per differ D2 (planted breaks missed), D3 (planted non-breaks called breaking), D1
  (verdict equal to oasdiff's, over the pairs both read), D4 (median time on the timing pairs),
  crashes, and every pair where it and the label disagree.
- **R5. The lane.** The `contractdiff` job in `bench.yml`: `--sample 50` nightly and on dispatch,
  `--sample 1000` on the weekly cron (every edit on every document is about 45,000 pairs per tool,
  _unmeasured_ in hours), uploaded as the `contractdiff-bench` artifact. A reading is committed under
  `benchmarks/apicontract/results/<date>-<sha>-diff/` by a PR, losing rows included.

## Design

The pins, cache and install folder are the corpus lane's (`corpus/pins.json`, `install.ts`,
`fetch.ts`); this adds an edit catalogue and runners, nothing in `packages/`. Protobuf pairs follow
the same shape with images and buf breaking as the reference, once a pinned buf runs in CI.

## Verification

- `diff-edits.test.ts`: each edit on a small fixture document whose schemas are shared by request
  and response, its output, and that the input is left alone; the pair picker and the seeded order.
- `diff-bench.test.ts`: the summary arithmetic on hand-made rows, each tool's verdict reader on the
  exit codes and text it is known to print, and each command line.
- Whether contractdiff's verdict matches each label is the reading itself: a mismatch is a finding
  about us, listed as a disagreement, not a failed test.
- The first reading committed with its losing rows.

## Rejected alternatives

- **oasdiff's verdicts as ground truth.** It is a competitor; D1 measures agreement with it.
- **Mined release history for D2/D3.** No label without a judge; history is used for timing only.
- **Adding the competitors as devDependencies.** The lockfile carries no competitor (corpus lane rule).
