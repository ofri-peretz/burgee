---
id: D-20261111-apicontract-own-validator
subject: 'apicontract runtime validation: generate and use Zod, or ship our own validator?'
taken: Taken
date: '2026-11-11'
superseded_by: —
---

**Our own validator, held to a state-of-the-art bar. Zod is not used: not as a dependency, not as a
peer, and not as generated output.** Owner direction, 2026-11-11.

This is already what the family's rules require (no dependency outside the repo, PRINCIPLES rule 2),
and it removes the one place the spec still produced Zod: `apicontract-zod` loses its generate
capability and keeps extract and detect. Zod stays an incumbent we read as code-first input and
migrate users off (`apicontract-schema migrate --from zod`), graded by Zod's own suite, because a
replacement nobody can switch to has no users.

"State of the art" is measured: parity on the incumbents' suites, then R1–R3 in
[`metrics.md`](../intents/apicontract/metrics.md) against ajv, Zod 4, Valibot, ArkType and typia.
The review of the same day ([`review.md`](../intents/apicontract/review.md) F5) found no demand
reading for this piece, and that is still owed before its phase starts: the "support X too" and
hand-rolling counts of PRINCIPLES rule 7 across those five validators.

**Closed 2026-11-11:** the validator also gets a code-first authoring API (schemas written in
TypeScript, as Zod's are), so it is a standalone product under PRINCIPLES rule 8 with its own intent,
[`validator/intent.md`](../intents/validator/intent.md), named after its capabilities are implemented
([`D-20261111-layer-bar`](./D-20261111-layer-bar.md)).

**Revisit:** if the owed reading shows no gap the five incumbents leave open.
