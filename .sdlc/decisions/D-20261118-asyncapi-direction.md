---
id: D-20261118-asyncapi-direction
subject: 'apicontract inputs: does an AsyncAPI 2.x operation read in the direction its verb names, or from the application side as 3.0 does?'
taken: Taken
date: '2026-11-18'
superseded_by: —
---

**From the application's side, like 3.0.** A 2.x `publish` operation is what the application
receives, so its payloads read as `subscribe`, and a 2.x `subscribe` reads as `publish`. Operation ids
keep their 2.x verbs, and one finding per 2.x document says the reading was turned.

The `ac-inputs` lane built R5 as written (the 2.x verbs as declared) and flagged the cost: the same API
read in opposite directions in 2.6 and in 3.0, so `apicontract diff` across a 2.6 → 3.0 migration would
report every operation as flipped. The direction exists in the model so that compatibility can be
judged per direction (spec R3), which only works if one direction means one thing across versions.

The owner delegated decisions like this on 2026-11-18
([`D-20261118-contracts-program-go-ahead`](./D-20261118-contracts-program-go-ahead.md)). Reversible:
the reading is one line in `input-asyncapi.ts`, held by a test that reads a 2.x operation and its 3.0
migration in the same direction.
