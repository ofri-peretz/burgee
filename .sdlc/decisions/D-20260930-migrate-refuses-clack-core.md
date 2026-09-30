---
id: D-20260930-migrate-refuses-clack-core
subject: '`burgee migrate` rewrites `@clack/prompts` to `caique/clack` and leaves `@clack/core` alone. What does it do with a file that imports both?'
taken: Taken
date: '2026-09-30'
superseded_by: —
---

**It refuses the file, with the reason `sibling-state` and a fix: "import { updateSettings } from 'caique/clack' instead of '@clack/core', then re-run burgee migrate".** This closes the residual gap that D-20260930-caique-clack-core-exclusion stated and left as a follow-up.

**The gap.** `@clack/prompts` reads its settings from `@clack/core`'s module state. `caique/clack` does not depend on `@clack/core` (U6). Before this, a file that imported `text` from `@clack/prompts` and `updateSettings` from `@clack/core` had its prompts moved to `caique/clack`. Its `updateSettings({ withGuide: false })` went on configuring clack, which nothing read any more. The report said nothing and the exit code was `OK`.

**Why a refusal, and not a rewrite of `@clack/core`.** `@clack/core` is its own package with its own surface: `Prompt`, `TextPrompt` and the other classes a custom prompt extends. `caique/clack` exports `updateSettings` and `settings`, and not those. Mapping `@clack/core` to `caique/clack` would turn a custom prompt's import into TS2305. A refusal is A4's shape. The file is named by line, left whole (A5), and the run exits `RUNTIME` (A8). The `fix` is the one edit that lets the next run move the file.

**The rule, as data.** `SIBLING_STATE` in `packages/burgee/src/migrate.ts` maps an incumbent to the sibling whose state it reads, and to the fix. Today it has one entry, `@clack/prompts` → `@clack/core`. The refusal fires only when the incumbent is a rewrite candidate in that file. An incumbent that is skipped because it is off its graded major, or that is not level, is not a candidate. The sibling counts in all three positions: `import … from` (and `export … from`), `import()`, and `require()`.

**What is not refused.**

- A file that imports `@clack/core` and not `@clack/prompts`. It is not a rewrite candidate, so it stays as it was and is not reported.
- A type-only import of `@clack/core` (`import type { … } from '@clack/core'`). It is erased before anything runs, so it configures nothing.

**The residual, stated.** The check reads one file at a time, as the whole scan does (D-050). A program that calls `updateSettings` from `@clack/core` in a file with no clack prompts, and prompts from `@clack/prompts` in another file, still migrates the prompts file. The docs (`migrate`, `concepts/drop-ins`, caique's `coming-from/clack` and `drop-ins`) say so.

**Evidence.** `migrate.test.ts` › `A4 — a sibling whose state the incumbent reads refuses the file` has one case per import form, plus the `migrate()` report case. All four failed against the code before this change, each on `refused: []` and a rewritten source. The type-only case failed against a mutation that drops the type-only exemption. burgee coverage stays at 100 / 100 / 100 / 100. `benchmarks/run.ts --axis weight --check` reports 0 gate failures, and `readme:gates` has nothing to write.
