# Design — `contract-properties`

Intent: [`intent.md`](./intent.md). **Status:** R1 to R5 built (`apicontract props`).

---

## Requirements

- **R1** An arbitraries generator from the contract model: one fast-check arbitrary per schema,
  honouring type, enum, const, bounds, pattern, formats, required, `additionalProperties`,
  `oneOf`/`anyOf`/`allOf` and recursion with a depth bound.
- **R2** A mutated arbitrary per schema that breaks exactly one constraint and records which.
- **R3** `props` runs round-trip, validator agreement, diff soundness (given `--against <old>`) and
  normalisation idempotence; exit 1 on any counterexample, with seed and shrunk value.
- **R4** `props --emit <file>` writes the arbitraries as an importable module.
- **R5** `--json` and SARIF output, like `diff`.

## Design

- Generator walks the same normalised model as the TypeScript and validator generators, so a
  keyword they support and it does not is a lock-test failure, not a silent gap.
- Diff soundness samples from the old request schema and checks under the new, and the reverse for
  responses, per the direction rules in `compat.qnt`.
- A burgee command beside `diff` and `lint`.

## Verification

- `packages/contractdiff/src/props-*.test.ts`: each property on fixture contracts, plus one planted
  bug per property shown red then green.
- A keyword-coverage lock comparing the generator's keyword list to the validator's.
- oxmutate through `mutation:changed`.

## Rejected alternatives

- **Wrapping Schemathesis.** Needs a running server and Python; the point is a static check.
- **Hand-written properties per contract.** The agent would choose the inputs, which is the bias
  this removes.

## Out of scope

- Stateful API workflows (Arazzo). A later lane.
- Load or performance testing.

## What is built

| Requirement              | Where                                                                                                                            | How it is checked                                                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| R1 generator             | `props-generate.ts`: a seeded generator of its own, not fast-check, so apicontract has no new runtime dependency                 | `props-generate.test.ts`: every value from an exact draw passes the validator, per keyword and format    |
| R2 one broken constraint | `props-mutate.ts`: only on typed schemas with no union or reported keyword beside them                                           | `props-mutate.test.ts`: each break is refused at the path it was made                                    |
| R3 four properties       | `props-run.ts`; `command-props.ts` exits 1 with the seed and the shrunk value                                                    | `props-run.test.ts`: one planted bug per property, red, and the same run green on apicontract's own code |
| R4 `--emit`              | `props-emit.ts`: a fast-check module, `notGenerated` listing each keyword an arbitrary does not hold to, passed along references | `props-emit.test.ts`: the written module imported and sampled, each value checked by the validator       |
| R5 `--json`, SARIF       | `command-props.ts`: `--json` is burgee's envelope; `--sarif` prints `toSarif`, one `error` per counterexample at the contract file, rule `props/<property>` | `command-props.test.ts` "props --sarif" and "toSarif": seen red (no `toSarif`), then green; a planted classifier bug comes out as a `props/soundness` error and exit 1 |

Keyword coverage is `GENERATED` and `REPORTED` in `props-generate.ts`; `props-keywords.test.ts` reads the
validator's reader and fails on any keyword it reads that is in neither
(`npx vitest run packages/contractdiff/src/props-keywords.test.ts`).

The diff-soundness success criterion is met by `props-run.test.ts` ("a classifier that calls a breaking change
compatible"): with the classifier's findings removed, `old` against `new` in `__fixtures__/props/` gives three
counterexamples, shrunk to the boundary value (`quantity: 11` under a maximum of 10); with the real classifier, none.

Not yet run: the corpus lane's pinned set at 1,000 cases. A 25-document sample
(`npx tsx benchmarks/apicontract/fetch.ts --family openapi --sample 25 --seed 7`, then `props` on each at 50 runs)
gave no counterexample on 2026-11-23, by hand; wiring it into the corpus lane is the next step.
