---
id: A-20261118-validator-tuple-roundtrip-grows
section: A
status: open
source: 'lane ac-extract round-trip reading, 2026-11-18 (PR #1630)'
done_when: 'fromJsonSchema(toJsonSchema(s)) is a fixed point for every tuple schema in the validator tests: a second pass produces the same JSON Schema as the first'
---

**A tuple schema grows on every pass through the validator's JSON Schema import and export.**
Round-tripping a `prefixItems` tuple through `validator/json-schema` (`toJsonSchema` then
`fromJsonSchema`) wraps it once more on each pass, so the round trip never settles: 4 of 5 corpus
documents reach a fixed point after one pass, the tuple document never does. The validator lane
owns the fix; the extract lane's B1 reading depends on it.
