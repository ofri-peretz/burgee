---
id: D-20261026-disabled-rule-ceiling
subject: 'burgee criterion 4: what is counted as a disabled rule in runtime source, and where does the ceiling start?'
taken: 'Taken by the coordinator under the owner''s delegation (burgee-owner-delegates-tradeoffs), 2026-10-26'
date: '2026-10-26'
superseded_by: —
---

**The count is the distinct rules ESLint resolves to `off` for at least one non-test file under
`packages/*/src/`, and the ceiling starts at 50.** The umbrella's design gate restated criterion 4
from "zero disabled rules in the runtime packages" to a ratchet that only moves down
([D-20261025-burgee-umbrella-design-accepted](./D-20261025-burgee-umbrella-design-accepted.md)).
`scripts/disabled-rules-lock.test.ts` is that ratchet.

**Resolved, not grepped.** The root config computes its rule table: `everyRule()` turns every rule
of every plugin on and the `OFF` table switches some off, so `"off"` never appears as text for
those. And a textual count would include overrides for `apps/`, `scripts/` and tests, which reach
no runtime file. The lock asks ESLint itself, through `calculateConfigForFile`, for each of the
runtime files `git ls-files` lists, and counts the rules left at severity 0.

**Distinct rules, not file × rule pairs.** The nine global `OFF` entries (seven `import-next`,
two `lambda-security`) reach every runtime file, so a pair count would rise each time anybody adds
a source file, and every PR in flight would turn red. The distinct count rises only when a rule is switched off for runtime code that was on for
all of it, which is the event the criterion is about.

**The ceiling, failing-first.** Written at 0, the lock failed and listed 50 rules: 16 from
`import-next`, 11 from `maintainability`, 7 from `reliability`, 4 from `secure-coding`, 3 from
`node-security`, 3 from `operability`, 2 each from `conventions` and `lambda-security`, and 1 each
from `modernization` and `performance`. The ceiling is 50, and a second case pins it *at* the count,
so a rule switched back on lowers the ceiling in the same change and cannot quietly be switched off
again.

**The other two halves.** Every literal config block that switches a rule off for runtime source
must hold a comment, and every `OFF` table entry carries its reason as its value: both hold today,
and both were proven red (a stripped comment on the `mcp.ts` block, an emptied `lambda-security`
reason). The wired Interlace plugins are counted as the `eslint-plugin-*` imports whose repository
is `ofri-peretz/eslint`: 31, against the criterion's 9.

**Proven red as the design gate asked:** one `"off"` added to the `packages/burgee/src/mcp.ts`
override block (`secure-coding/no-hardcoded-credentials`) failed the ceiling and the pin.

**Not counted:** inline `eslint-disable` comments, of which runtime source carries 108. Each is
scoped to a line and states its own reason beside it, which is the review the criterion wanted, and
counting them would make every PR that needs one a ceiling edit. If that number becomes the
problem, it gets its own ratchet.
