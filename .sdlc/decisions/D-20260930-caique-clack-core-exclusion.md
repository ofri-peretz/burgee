---
id: D-20260930-caique-clack-core-exclusion
subject: 'D-152 left `caique/clack` at 16 / 17 on a case that imports `updateSettings` from `@clack/core`. Is that case a ceiling to publish, or outside `@clack/prompts'' contract and a declared exclusion?'
taken: Taken
date: '2026-09-30'
superseded_by: —
---

**It is a declared exclusion, and `caique/clack` reads 16 / 16, level with a control of 16 / 16.** This supersedes D-152 on one point only: its "the ceiling, restated as a decision" clause. The rest of D-152 stands: the twelve prompts, the D-001 subtraction, the ten names left unbuilt, and the weight. D-152 is not edited. **The case:** `guide.test.ts` › `guide` › `no prompt renders a guide when withGuide is globally false`. The test file itself runs `import { updateSettings } from '@clack/core'`. The case then asserts that every prompt reads the module-level state of that sibling package.

**Why it is outside the contract.** The case grades `@clack/core`, a different package with its own suite. It does not grade `@clack/prompts`. The same setting through `@clack/prompts`' public API is its re-exported `updateSettings`. `caique/clack` exports that name, and `packages/caique/src/clack.test.ts` holds all twelve prompts to it. The sibling case `no prompt renders a guide when withGuide is false` stays graded and passes. No implementation passes the excluded case without depending on `@clack/core`, which U6 forbids. So it measured the dependency rule, not the drop-in.

**How it is excluded.** One entry in `packages/compat-oracle/src/hosts.ts` with `exact: true`, which is `Exclusion.exact`, the mechanism A27 built for terminal-link's two cases. It matches the full flat-TAP title, so the second guide case, whose title differs by one word, cannot be caught. The control run passes `requireMatch`, so a reworded upstream title turns the control red. The reason is rendered on the compatibility page as a declared subtraction (`scripts/compat-page-subtractions.test.ts`).

**Grades before and after**, `@clack/prompts` 1.8.1, the latest release on 2026-09-30 and the vendored one:

- Before: target 16 / 17, control 17 / 17.
- After: target 16 / 16, control 16 / 16.

The TAP of both runs was captured with `COMPAT_TAP_DIR`. The excluded title appears once in each run, and it is the only line removed. `@inquirer/core` was regraded at its latest release, 12.0.3, also the vendored one: **41 / 41, control 41 / 41**, unchanged. Issue #699 (clack 1.8.1) is answered by the same run. The suite is graded at 1.8.1, and `packages/caique/competitors.json` now fingerprints 1.8.1. That release changed no export.

**What level sets in motion (D-137).**

- `burgee migrate` now rewrites `@clack/prompts` to `caique/clack`. `FACADE_EXPORTS['caique/clack']` carries the 86 names the checker sees, and `facade-types.test.ts` holds that list to the checker.
- A file that imports `box`, `progress` or `taskLog` is refused as `unknown-export` and stays on clack. `migrate.test.ts` pins this.
- `drop-in-type-surface-lock.test.ts` names the ten missing names as gaps.

**The one residual gap, stated rather than hidden.** `migrate` does not touch `@clack/core`. So a program that calls `updateSettings` from `@clack/core` and prompts from `@clack/prompts` keeps changing clack's settings after migration, and caique's prompts never read them. The docs (`coming-from/clack`, `drop-ins`) and the changeset say to import `updateSettings` from `caique/clack`. A migrate refusal for a file that imports `@clack/core` beside a rewritten `@clack/prompts` would close the gap mechanically. That is a follow-up, not part of this decision.
