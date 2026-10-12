---
"caique": minor
---

New entry point `caique/inquirer/prompts`: `@inquirer/prompts`' `select` and `checkbox`, with `Separator` and their config, theme and choice types, over `caique/inquirer`'s prompt loop. Both are graded by their own suites in `@inquirer/prompts` 8.7.3, `select`'s pagination suite included: 100 of those 100 cases pass, level with the real packages. Paging follows `@inquirer/core`'s `usePagination`, multi-line choices and `loop: false` included. The other eight prompts are not built yet, so `burgee migrate` does not rewrite `@inquirer/prompts` imports. `caique/inquirer` is unchanged, and a program that imports it loads none of this.
