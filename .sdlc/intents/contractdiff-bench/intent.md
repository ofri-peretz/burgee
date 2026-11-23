# Intent — contractdiff against its competitors, measured on one corpus

> Asked by the owner on 2026-11-23 ("we should ensure we can benchmark it to competitors"), after
> [`apicontract-protobuf`](../apicontract-protobuf/intent.md). PRINCIPLES rule 4: measured or it is a
> slogan. Gives the diff metrics D1–D5 in [`../apicontract/metrics.md`](../apicontract/metrics.md)
> the harness they name and do not yet have.

**Status:** approved · **Opened:** `2026-11-23` · **Owner:** `@ofri-peretz` · **Lane:** `ac-corpus` ·
**Accepted under:** the owner's request of 2026-11-23 and standing delegation (proceed on reasonable
defaults; publishing and naming stay with the owner)

---

## What is wanted

- **R1. A labelled corpus of changes.** Pairs of contracts (old, new) whose verdict is known:
  planted changes, made by applying one catalogued edit to a real document from the existing corpus
  pins, each edit labelled breaking or not for old callers; and real adjacent releases (Stripe,
  GitHub) for timing. OpenAPI 3.x first, protobuf images second.
- **R2. Every competitor run on it, at a pinned version, outside the lockfile.** oasdiff,
  openapi-diff, optic and buf breaking for the diff; Spectral and Redocly for the linter. Each is
  installed into a temporary folder through `benchmarks/apicontract/install.ts`, or fetched as a
  pinned release binary with its sha256, never added as a dependency.
- **R3. One reading, per tool.** Missed breaks (D2), false breaks (D3), agreement with oasdiff
  (D1), median time on the timing pairs (D4), crashes, and formats covered (D5), with every
  disagreement listed by pair and tool, losing rows included.
- **R4. Run where the other benchmarks run.** A `--sample N` mode nightly, a larger sample
  weekly, results under `benchmarks/apicontract/results/`.

## Why now

contractdiff now reads six formats and judges transitively, by usage and through buf; whether it
is better than oasdiff at the one format they share is still a claim nobody can re-run. The owner
asked for the comparison before anything about it is said in public.

## Affected users and systems

`benchmarks/apicontract/**`, the nightly workflow. No package changes.

## Constraints

- Ground truth is the edit catalogue, written down and reviewed, not any tool's output: oasdiff
  is a competitor here, and D1 is agreement, not accuracy.
- Each tool is asked the question it answers: backward compatibility for old callers. A tool that
  cannot be asked it (a linter) is read for time and crashes only.
- Nothing downloaded is committed; pins and sha256s are. A changed sha is a failed run.

## Success criteria

- The catalogue holds at least 20 edits, at least 8 of them non-breaking, each with its label and
  the reason for it.
- `npx tsx benchmarks/apicontract/diff-bench.ts --sample 50` writes one row per pair and tool, and a
  summary with D1–D4 per tool.
- The first nightly reading is committed, losing rows included.

## Defaults taken

- Planted edits rather than mined history for D2/D3: a mined pair has no label without a judge.
- optic is read through its `diff` command on two files; its cloud features are out of scope.
- Spectral and Redocly are read with their recommended rulesets beside `lint --ruleset recommended`,
  for time and crashes; their findings differ by design and are not scored against ours.

## Out of scope

Publishing the numbers on the docs site or in any announcement: that is the owner's call, made on the
first reading. Benchmarks of `gen` (the corpus lane's scoreboard already covers it).
