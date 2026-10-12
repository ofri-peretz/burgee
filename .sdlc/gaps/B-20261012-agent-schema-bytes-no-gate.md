---
id: B-20261012-agent-schema-bytes-no-gate
section: B
status: open
source: control-band-agent-schema-bytes, D-20261012-agent-schema-bytes-step-change
recommendation: 'gate burgee''s `schema-bytes` record in `benchmarks/axes/reliability.ts` at a committed budget, as `skill-bytes` is gated at `SKILL_BYTES_BUDGET`; raising it is then a decision, not a band breach found after the fact'
---

`schema-bytes`, the bytes of `--schema` on the burgee demo, is reported by the reliability axis
with no `gate`. `machine-json.test.ts` fails if the document stops being compact, but nothing
fails when it grows: from 1,678 to 4,752 B between `a049bc2` and `a2e4f98`, the only signal was
the `agent-schema-bytes` control band breaching after the fact. Those four steps were accepted
conformance requirements; the next one may not be, and the band will not see it until four of
five observations sit outside it.

No budget is chosen here. The measured value on 2026-10-12 is 4,752 B (`4c85515`).
