---
id: D-20261019-lighter-than-commander-ratchet
subject: 'The `lighter-than-commander` claim ratchet comes down from 1.565 to 1.42'
taken: 'Taken — on the owner''s delegation of 2026-10-12 over budgets and trade-offs, under D-157''s downward-only rule'
date: '2026-10-19'
superseded_by: —
---

**`lighter-than-commander` in `.sdlc/bands/claim-ratchets.json` moves from 1.565 to 1.42.** This
is `commander-front-end-diet` R4's last step. The spec left the claim ratchet to "the first commit
after the Benchmarks workflow publishes a CI reading of this build".

**Evidence.** Every CI reading since `2026-10-13-ba91416-ci` gives `burgee/commander` as
**55,346 B** and the ratio as **1.416**. That includes the newest, `2026-10-19-c05c86e-ci`. A
clean local build of main at `6b90ffe` reads the same 55,346 B over commander's 39,084 B.

**The rule.** This is the row's own `derive` rule, the one D-157 set, and `npm run ratchets:propose`
prints it: (55,346 + 80 B CI margin) / 39,084 = 1.418, rounded up to the next 0.005, is **1.42**. That
holds 55,499 B, which is 153 B above today. B4's byte ceiling for `burgee/commander` (55,400 B)
still binds before the ratio does.

**What it changes in public.** The claim text in `benchmarks/claims.ts` reads the ceiling, so
`--check`, the README row and `apps/docs/content/docs/benchmarks.mdx` now say 1.42×. The
README's ratchet table and `apps/docs/content/docs/vs/commander.mdx` were edited to match.

**Reversal path.** None by editing. The history is append-only, and
`scripts/claim-ratchets-lock.test.ts` refuses a raise unless it cites a newer decision. A façade
change that needs more than 153 B over commander has to write that decision.
