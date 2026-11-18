---
id: A-20261118-diff-false-breaking-equivalent-rewrites
section: A
status: open
source: 'lane ac-extract round-trip reading, 2026-11-18 (PR #1630, .sdlc/intents/apicontract-extract/spec.md § As built)'
done_when: 'compareContracts reports non-breaking for every schema pair in the extract lane corpus that accepts exactly the same values, with a test per rewrite shape, and B1 reads 5 / 5 non-breaking on that corpus'
---

**`apicontract diff` calls a schema rewrite breaking when it accepts exactly the same values.** The
extract lane's round trip (generate a spec, extract it back, compare) found 4 of 5 corpus documents
where the extracted schema is written differently from the original but validates the same set of
values, and `compareContracts` classified each as breaking. Only 1 of 5 was called non-breaking.

The diff lane owns the fix (`src/diff-schema.ts`): normalise equivalent shapes before comparing
(for example `type: [T, "null"]` against `anyOf: [{type: T}, {type: "null"}]`, a `$ref` against its
inlined target, `const` against a one-member `enum`), or classify a pair as `neutral` when each side
is provably a subset of the other. False breaks are metric `D3`; this gap is the first measured case.
