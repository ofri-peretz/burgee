---
id: D-20261011-inquirer-pagination-suite-is-selects
subject: '`inquirer-prompts-drop-in` R1 says to vendor `@inquirer/core`''s pagination suite into the `inquirer-core` host. `@inquirer/core` 12.0.4 ships no pagination suite. Where is `usePagination` graded?'
taken: Taken
date: '2026-10-11'
superseded_by: —
---

**By `@inquirer/select`'s `test/pagination.test.ts`, as part of the `inquirer-prompts` row, and not by a growth of the `inquirer-core` row.** R1's premise, and the sentence in `caique/spec.md` it quotes ("`@inquirer/core`'s repository has a pagination suite that is not vendored yet"), were true of an older `@inquirer/core` and are not true of the release this repository grades.

**The measurement.** At the tag `@inquirer/core@12.0.4` (commit `a9436bd9`, the same commit as `@inquirer/prompts@8.7.3`), the only test files under `packages/core/` are `core.test.ts` (41 cases, already graded) and `src/lib/utils.test.ts`, which tests the internal `breakLines` helper and never imports `usePagination`. `packages/core/src/lib/pagination/` holds `use-pagination.ts` and nothing else. The suite R1 meant, `lines.test.ts` beside the pagination code, was removed by upstream commit `5985e79` (2025-05-25, "Major refactor of the pagination logic to work better with multi-line choices"), and its cases were rewritten against the prompt that uses the hook: `packages/select/test/pagination.test.ts`, 10 cases, which renders `select` with `pageSize` and `loop` and asserts the screen.

**What follows.**

- `pagination.test.ts` is one of the eleven `suiteFiles` of the `inquirer-prompts` host, graded with `select`. `usePagination` is built in `caique/inquirer` and exported there (it is part of `@inquirer/core`'s surface), and it is graded by those ten cases and by every `select`, `checkbox` and `search` case that pages.
- The `inquirer-core` row stays 41 / 41 against a control of 41 / 41. Intent success criterion 2 ("the `inquirer-core` row grows by its cases") cannot be met as written; it is met in substance by the ten pagination cases inside `inquirer-prompts`.
- Vendoring `utils.test.ts` into `inquirer-core` was considered and rejected: it imports `./utils.ts`, an internal module, so it would grade `breakLines` (a file layout) rather than anything `caique/inquirer` promises.
