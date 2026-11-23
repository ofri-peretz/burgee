# Design — contractdiff against its competitors, measured on one corpus

Intent: [`intent.md`](./intent.md). **Status:** approved.

---

## Requirements

- **R1. The catalogue** (`benchmarks/apicontract/diff-edits.ts`). Each edit is a pure function from
  an OpenAPI document to a changed copy, or `undefined` when the document has nowhere to apply it,
  with `id`, `label` (`breaking` | `non-breaking`, for old callers) and `why`. Breaking: an operation
  removed, a required request parameter added, a request property made required, a request property's
  type changed, a response property removed, a response property's type changed, an enum value removed
  from a request, a path parameter renamed, a success status removed, a security requirement added.
  Non-breaking: an operation added, an optional request parameter added, an optional request property
  added, a response property added, a description changed, an enum value added to a request, a
  request property made optional, an example changed.
- **R2. The pairs** (`diff-pairs.ts`). For each pinned OpenAPI 3.x document and each edit that
  applies, one pair, seeded and sampled by `--sample N --seed S`; plus the timing pairs (two adjacent
  pinned releases of the Stripe and GitHub specs). Written to the cache folder, never the repo.
- **R3. The runners** (`diff-tools.ts`). One adapter per tool: install or fetch at its pin, run it on
  a pair with the backward-compatibility question, and read its verdict (`breaking` | `non-breaking`
  | `crash`) and wall time from its own output. contractdiff runs from this checkout's build.
  Linters run on the new side of each pair and report time and crash only.
- **R4. The reading** (`diff-bench.ts`). One JSONL row per pair and tool, and `summary.json` and
  `summary.md`: per tool D2 (planted breaks missed), D3 (planted non-breaks called breaking), D1
  (verdict equal to oasdiff's), D4 (median time on the timing pairs), crashes, and every pair where
  a tool and the label disagree.
- **R5. The lane.** `--sample 50` in the nightly benchmark workflow beside the corpus lane, the full
  corpus weekly; results under `benchmarks/apicontract/results/<date>-<sha>-diff/`.

## Design

The pins, cache and install folder are the corpus lane's (`corpus/pins.json`, `install.ts`,
`fetch.ts`); this adds an edit catalogue and runners, nothing in `packages/`. Protobuf pairs follow
the same shape with images and buf breaking as the reference, once a pinned buf runs in CI.

## Verification

- `diff-edits.test.ts`: each edit on a small fixture document, its output, and that contractdiff's
  verdict matches the label (a mismatch is a finding about us, kept as a listed disagreement).
- `diff-bench.test.ts`: the summary arithmetic on hand-made rows.
- The first reading committed with its losing rows.

## Rejected alternatives

- **oasdiff's verdicts as ground truth.** It is a competitor; D1 measures agreement with it.
- **Mined release history for D2/D3.** No label without a judge; history is used for timing only.
- **Adding the competitors as devDependencies.** The lockfile carries no competitor (corpus lane rule).
