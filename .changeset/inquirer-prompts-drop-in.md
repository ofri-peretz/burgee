---
"caique": minor
"burgee": patch
---

`caique/inquirer` now carries `select` of `@inquirer/prompts`, exported by name as `@inquirer/prompts` exports it, and `usePagination` from `@inquirer/core`. They pass all 52 of their cases in `@inquirer/select`'s own suites, 52 of `@inquirer/prompts`' 213; the other nine prompts are not in this release, so `burgee migrate` does not rewrite `@inquirer/prompts` yet. caique's tarball no longer ships a compiled test fixture. `burgee migrate` knows the new names `caique/inquirer` exports.
