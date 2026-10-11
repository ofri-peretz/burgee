---
id: D-20261011-inquirer-prompts-editor-mock
subject: 'Every case in `@inquirer/editor`''s suite answers the prompt through `vi.mock(''@inquirer/external-editor'')`. Can `caique/inquirer`''s `editor` be graded by it?'
taken: Taken
date: '2026-10-11'
superseded_by: —
---

**No. The eleven cases of `packages/editor/editor.test.ts` are excluded by exact title, for both sides, and the `inquirer-prompts` row is 213 cases, not 224.** The D-20260930-caique-clack-core-exclusion class: each case grades a module of the incumbent's tree that caique does not import.

**The measurement.** The suite installs `vi.mock('@inquirer/external-editor')`, makes the mocked `editAsync` return a promise the test settles by hand, and in every case asserts what `editAsync` was called with or how often (`toHaveBeenLastCalledWith('', { postfix: '.txt' })`, `toHaveBeenCalledTimes(2)`), then answers the prompt by settling that promise. `caique/inquirer` has no runtime dependency (U6), so it launches the editor with its own code; the mock can neither see the call nor answer it, and no implementation of ours can pass a single case. Read case by case on 2026-10-11 at 8.7.3: all eleven call `editAsync` assertions, and all eleven reach the answer only through `editorAction`, which settles the mock.

**Two harness settings came with it, both in `hosts.ts` beside the exclusion.**

- `vitestConfig.server.deps.inline: ['@inquirer/prompts', '@inquirer/editor']`. Upstream runs the suite against its own source, where the mock reaches `@inquirer/editor`'s import. Vendored, the control loads the published package from `node_modules`, which vitest externalizes, so the mock did not reach it: the control opened eleven real `vi` processes and hung to the oracle's cap, reading **213 / 224**. Inlined, the control is **224 / 224** before the exclusion and **213 / 213** after it. No assertion is touched, and a target run inlines nothing of ours.
- `env: { EDITOR: 'true', VISUAL: 'true' }`. An excluded case still runs. On a target run, a prompt that launches `$EDITOR` must not open a real editor on the grading machine and wait for it; `true` exits at once.

**What is not lost.** `caique/inquirer` still exports `editor`, so `burgee migrate` does not refuse a file that imports it, and `packages/caique/src/` grades it with its own tests against the same rendered frames the excluded cases assert. The compatibility page lists the eleven titles with the reason.
