---
"burgee": patch
"caique": patch
"compat-oracle": patch
---

`@inquirer/prompts` is now graded: its ten prompts' own suites (8.7.3) are vendored and run against `caique/inquirer`, with a control of 213 of 213 against the real packages. `caique/inquirer` passes 0 of them today, because it exports `@inquirer/core`'s surface and none of the prompts yet, and `burgee migrate` reports `@inquirer/prompts` as a graded path that is not level, never rewriting it. The eleven `@inquirer/editor` cases are excluded by title: each answers the prompt through a mock of `@inquirer/external-editor`, which caique does not import.

The oracle gains two host fields for it. `suiteFiles` lists a monorepo suite's files across several packages and vendors only those; `defaultExport` grades a suite that imports its prompt as a default against the named export a program migrates.
