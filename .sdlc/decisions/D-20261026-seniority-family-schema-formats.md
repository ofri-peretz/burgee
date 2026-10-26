---
id: D-20261026-seniority-family-schema-formats
subject: 'Does seniority''s dist ceiling (R9, Y8) rise for the family schema describing `formats` (agent-headroom RF)?'
taken: 'Taken — on the owner''s delegation of 2026-10-12 over budgets and trade-offs (burgee-owner-delegates-tradeoffs)'
date: '2026-10-26'
superseded_by: —
---

**Yes: 144,000 → 144,700 B, the next hundred above the reading.** `agent-headroom` RF adds
`formats` to the family plugin schema, which is byte-identical in every host
(`plugin-contract` R2). seniority ships that file in `dist/`, so its built package grows by the
file's 930 B (17,945 → 18,875 B minified). This was first written as 142,000 → 142,900 against
141,896 B. #1264 then raised the ceiling to 144,000 for 1,781 B of its own
(D-20261026-seniority-spawn-bars), and the build after it measures 143,677 B. This adds 930 on
top of that, for 144,607 B. No
seniority code changed.

**Value gained.** The schema a plugin author validates against describes the key burgee now
reads. Leaving `formats` out of the shared file would teach an incomplete shape, the defect
`plugin-schema-lock.test.ts` exists to catch. Splitting seniority's copy off would break R2's
identity.

**What it costs.** 930 B of data in seniority's tarball, which nothing imports. The same 930 B
lands in every other host. Only seniority's ceiling had too little room to absorb it. The
foundation bands were re-converged (`npm run weight:converge`; seniority 222,219 → 223,149 B).

**Reversal.** Remove `formats` from `packages/flagstaff/src/schema.json`, then run
`node scripts/schema-sync.mjs`, and the ceiling can fall back to 144,000.
