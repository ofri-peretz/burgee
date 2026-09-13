---
'burgee': minor
---

`--schema` publishes `relations` (S2/S6). `validate.ts` has enforced `exactlyOneOf`,
`conflicts`, `implies` and the rest since the surface shipped, and the schema never said so —
an agent could only discover a constraint by violating it. A predicate `implies` publishes as
`"(predicate)"` rather than the `null` `JSON.stringify` would leave.
