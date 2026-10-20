---
"caique": minor
---

`caique/inquirer/prompts` now carries all ten of `@inquirer/prompts`' prompts: `input`, `confirm`, `password`, `number`, `expand`, `rawlist`, `search` and `editor` join `select` and `checkbox`, with their config and theme types. `@inquirer/prompts` 8.7.3's own suites pass 213 / 213, level with `@inquirer/prompts` itself (the eleven `editor` cases that answer through a mock of `@inquirer/external-editor` are excluded for both sides, D-20261011-inquirer-prompts-editor-mock). The subpath bundles to 44,683 B against the incumbent's 582,754 B. `editor` starts the user's editor through `bellpull/cross-spawn`, so caique now depends on `bellpull`.
