# Design — `contract-properties`

Intent: [`intent.md`](./intent.md). **Status:** draft.

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

- `packages/apicontract/src/props-*.test.ts`: each property on fixture contracts, plus one planted
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
