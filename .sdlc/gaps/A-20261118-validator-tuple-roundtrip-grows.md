---
id: A-20261118-validator-tuple-roundtrip-grows
section: A
status: closed
source: 'lane ac-extract round-trip reading, 2026-11-18 (PR #1630)'
done_when: 'fromJsonSchema(toJsonSchema(s)) is a fixed point for every tuple schema in the validator tests: a second pass produces the same JSON Schema as the first'
---

**A tuple schema grows on every pass through the validator's JSON Schema import and export.**
Round-tripping a `prefixItems` tuple through `validator/json-schema` (`toJsonSchema` then
`fromJsonSchema`) wraps it once more on each pass, so the round trip never settles: 4 of 5 corpus
documents reach a fixed point after one pass, the tuple document never does. The validator lane
owns the fix; the extract lane's reading of metric B1 (round trip,
[`metrics.md`](../intents/contractdiff/metrics.md)) depends on it.

**Closed 2026-11-18.** The reader ignored `minItems` when it read `prefixItems` as "these items if
they are there", and read `items: false` as a rest of `never`, so each pass added a union of shorter
tuples and an `allOf` with the bounds. It now builds only the lengths the bounds allow and reads
`items: false` as a closed tuple: every tuple in the validator's tests is written back exactly as it
was written, in 2020-12 and draft-07 (`packages/loadline/src/round-trip.test.ts`).
