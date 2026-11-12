---
id: D-20261112-validator-gaps
subject: 'validator: which gap does Zod actually leave?'
taken: Taken
date: '2026-11-12'
superseded_by: —
---

**Nine, read from Zod's own tracker: abort-early, refinements that always run and land on the right
path, discriminated unions, object shape controls, formats as plugins, an exact JSON Schema round
trip, type-level cost, a single-pass Standard Schema path, and release safety.**

Zod had 105 open issues and 480 closed as not planned on 2026-11-12. Ranked by 👍, the open and the
declined requests fall into those groups; the issue numbers and counts are in
[`validator/intent.md`](../intents/validator/intent.md) § Where Zod is beatable. The declined ones
matter most (PRINCIPLES rule 7): formats alone (latitude and longitude, phone, cron) were declined
with 113 👍 between them, which is the evidence that a format should be a plugin.

This answers the open question with requests people filed, so "better than Zod" names gaps Zod has
(PRINCIPLES rule 13). It does not answer speed, bundle size or type-check cost: no tracker holds
those, and they stay as metrics V3, V4, V5 and V7 to be measured before design. The reading is also
modest in size, tens of 👍 against 454M installs a week, and the intent says so.

**Revisit:** re-read the tracker when design starts; a gap Zod closes in the meantime leaves the
list and metric V15's twenty.
