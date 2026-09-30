---
id: D-20260930-roundel-chalk-601-regrade
subject: 'chalk 6.0.1 (#694, #701) — regrade roundel/chalk at the latest release, and whether its byte ceiling follows chalk up'
taken: Taken
date: '2026-09-30'
superseded_by: —
---

**`roundel/chalk` is graded at chalk 6.0.1: 59 / 59, level with the control's 59 / 59; the `./chalk` byte budget stays at 9,370, chalk 6.0.0's figure, although 6.0.1 measures 9,521.** Re-vendored with `npx tsx scripts/vendor-suite.ts chalk --version 6.0.1` (tag `v6.0.1`, commit `47fc05ab`): one test added, *"convert multiple arguments the same way regardless of their count"*, and `source/index.js` changed to match; roundel passed it with no code change. The baseline moves 58 → 59, `GRADED_VERSIONS.chalk` in `burgee/src/compat.ts` to 6.0.1 (so `burgee migrate` names the version it was graded at), the root and benchmarks ranges to `^6.0.1` (the lock already resolved 6.0.1, so the control had been grading 6.0.1's code against 6.0.0's suite), `competitors.json` to 6.0.1's fingerprint (21,568 B), and every page that stated the grade. **The budget:** R8 names chalk's own bytes as the ceiling and says it is re-measured when vendored, which would allow 9,521. Raising a ceiling because the incumbent grew is a loosening, and loosening is the owner's call; held at the smaller number, "no heavier than chalk" is true of both releases, and `roundel/chalk` still measures under it. The re-measurement is recorded in `weight.test.ts` beside the budget.
