---
id: D-20261122-contracts-governance-accepted
subject: 'Are the lint and decision-marker intents accepted for Build?'
taken: Taken
date: '2026-11-22'
superseded_by: —
---

**Accepted.** The owner accepted both intents and their designs on 2026-11-22 ("Accept both"):
[`apicontract-lint`](../intents/apicontract-lint/) and
[`apicontract-diff-decisions`](../intents/apicontract-diff-decisions/).

Both follow the Snappy Agent Playbook (November 2026), which the owner adopted for this work the
same day: code decides facts and people decide meaning; tools spot changes, people decide, and the
decision is written down; nobody changes the rules in the change they are judged by; new checks
warn first; every finding says how to fix it.

Build order: `diff` decision markers first (one module on a shipped engine, steps 1–6 of its
spec), then `lint` in the six steps its spec lists, kind-3 code rules last. Nothing is published
by this decision; publishing stays behind the release gate.
