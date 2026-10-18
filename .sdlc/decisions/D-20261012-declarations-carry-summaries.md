---
id: D-20261012-declarations-carry-summaries
subject: 'Which doc comments does a published `.d.ts` keep, now that burgee''s 240,393 B of declarations are 26% of its unpacked tarball?'
taken: 'Taken — on the owner''s delegation of 2026-10-12 over budgets and trade-offs'
date: '2026-10-12'
superseded_by: —
---

**A published declaration keeps what an editor shows a caller, and drops the design notes.**
Kept: a JSDoc block's first paragraph, and its `@param`, `@returns`, `@throws`, `@example`,
`@deprecated`, `@default` and `@see` tags. Dropped: every later paragraph of prose, and any
comment that is not JSDoc. Source files keep everything; only the emitted `.d.ts` changes.

**Why not either extreme.** D-20261012-burgee-tarball-rebaseline measured stripping every
comment at −46,300 B gzipped (−18.8%), and refused it because it deletes hover text. Keeping
everything ships this repository's rationale essays (the multi-paragraph "why" blocks this
codebase writes above most exports) to every install, where an editor shows them as a wall of
text in a tooltip. The first paragraph is the summary by this repository's own convention, and
the tags are what editors render structurally.

**Bytes.** *Unmeasured* for this rule: the intent's R1 measures it before anything is cut.

**What the incumbent pays.** commander 15.0.0 packs at 52,736 B gzipped, yargs 18.0.0 at
47,876 B, and burgee 1.3.0 at 246,526 B (the same decision file).

**Reversal.** Remove the summariser step from the build; the 10% tarball allowance in
`scripts/check-published-artifacts.ts` absorbs nothing, so a reversal re-records the baseline by
its own decision.
