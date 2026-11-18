---
id: A-20261118-diff-false-breaking-equivalent-rewrites
section: A
status: open
source: 'lane ac-extract round-trip reading, 2026-11-18 (PR #1630, .sdlc/intents/apicontract-extract/spec.md § As built)'
done_when: 'compareContracts reports non-breaking for every schema pair in the extract lane corpus that accepts exactly the same values, with a test per rewrite shape, no equivalent but differently written pair in the corpus lane''s full corpus is classified breaking, and metric B1 (round trip, .sdlc/intents/apicontract/metrics.md) reads 5 / 5 non-breaking on the extract corpus'
---

**`apicontract diff` calls a schema rewrite breaking when it accepts exactly the same values.** The
extract lane's round trip (generate a spec, extract it back, compare) found 4 of 5 corpus documents
where the extracted schema is written differently from the original but validates the same set of
values, and `compareContracts` classified each as breaking. Only 1 of 5 was called non-breaking.

The diff lane owns the fix (`src/diff-schema.ts`): normalise equivalent shapes before comparing
(for example `type: [T, "null"]` against `anyOf: [{type: T}, {type: "null"}]`, a `$ref` against its
inlined target, `const` against a one-member `enum`), or classify a pair as `neutral` when each side
is provably a subset of the other. False breaks are metric `D3`; this gap is the first measured case.

**Progress, 2026-11-18 (lane `ac-diff`).** `src/diff-normalise.ts` writes both sides in one spelling
before comparing; the shapes and their near misses are in `.sdlc/intents/apicontract-diff/spec.md`
§ As built. B1 on the extract corpus now reads **5 / 5 non-breaking** (was 1 / 5), pinned in
`extract-roundtrip.test.ts`. Three of the four `done_when` clauses hold. **Open:** "no equivalent
but differently written pair in the corpus lane's full corpus is classified breaking" cannot be read
yet: `benchmarks/apicontract/` has no corpus documents on main. Close this gap when the corpus lane
lands them and that reading shows zero false breaks.
