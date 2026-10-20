---
id: D-20261019-inquirer-prompts-pins-its-prompts
subject: 'The `inquirer-prompts` control fell to 212 / 213 on 2026-10-19 with no change in this repository. Is that the control a failure to excuse, or a measurement that moved?'
taken: Taken
date: '2026-10-19'
superseded_by: —
---

**A measurement that moved, so the fix is a pin and not an exclusion. `hosts.ts` now pins the ten prompt packages `@inquirer/prompts@8.7.3` re-exports at the releases it shipped with on 2026-10-04 (`checkbox@5.2.6`, `confirm@6.3.3`, `editor@5.3.4`, `expand@5.1.6`, `input@5.1.7`, `number@4.2.4`, `password@5.2.3`, `rawlist@5.3.6`, `search@4.3.4`, `select@5.2.6`), and the control reads 213 / 213 again.**

**The measurement.** Commit 326907eca passed the Compatibility workflow at 19:14 UTC and failed it at 23:22 UTC on the same day, on all three runners that grade controls. Between the two, at 21:42 UTC, Inquirer.js released `@inquirer/prompts@8.7.4`, `@inquirer/core@12.0.5` and a new patch of every prompt package, each asking for `@inquirer/core@^12.0.5`. `suiteDeps` pinned `@inquirer/prompts@8.7.3` and `@inquirer/core@12.0.4` exactly, but 8.7.3 asks for its prompts by caret, and the suite's install runs with `--no-package-lock`. So the prompts floated to the new patches, and npm placed a second core, 12.0.5, under each one beside the pinned 12.0.4 at the top. One case reads which core it has: `packages/checkbox/checkbox.test.ts > checkbox prompt > throws if all choices are separators` imports `ValidationError` from the top-level core and asserts `toBeInstanceOf(ValidationError)`. The prompt threw the nested core's class. Reproduced locally at 212 / 213 with that case as the only failure, and the installed tree showed 12.0.5 under nine prompt packages.

**Why not an exclusion.** The case is not flaky, and it does not grade a module caique cannot reach: it fails only because the control installed two releases of the incumbent's own core. That is the clack `vitest-ansi-serializer` caret again, one level down. With the ten pins, a clean install holds a single `@inquirer/core@12.0.4`, and the control reads 213 / 213. The target, `caique/inquirer/prompts`, still reads 100 / 213. `vendor.test.ts` now requires a pin for each prompt the row grades.
