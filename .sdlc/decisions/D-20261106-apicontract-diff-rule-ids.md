---
id: D-20261106-apicontract-diff-rule-ids
subject: 'apicontract `diff`: use oasdiff''s breaking-change rule ids, or its own?'
taken: Taken
date: '2026-11-06'
superseded_by: —
---

**oasdiff's rule ids, where one exists; a `cp-` id only for a change oasdiff has no rule for
(non-HTTP families, direction-aware message rules).**

oasdiff is the default breaking-change tool its users and Optic's former users already gate CI on
([`intent.md`](../intents/apicontract/intent.md) § Why now). Matching its ids makes switching a
config change, lets SC10 grade agreement case by case on oasdiff's own corpus, and keeps a
suppression list portable. The cost is that two id schemes exist side by side; `--json` carries
both the id and the family, so an agent never has to infer which.

**Revisit:** if oasdiff renames its ids, or if more than half of `diff`'s findings come from
non-HTTP families, where the `cp-` scheme would then be the main one.
