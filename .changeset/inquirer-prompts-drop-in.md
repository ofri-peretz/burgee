---
"caique": minor
"burgee": patch
---

`caique/inquirer` now carries `select` and `checkbox` of `@inquirer/prompts`, exported by name as `@inquirer/prompts` exports them, and `usePagination` from `@inquirer/core`. They pass all 100 of their cases in `@inquirer/select`'s and `@inquirer/checkbox`'s own suites, 100 of `@inquirer/prompts`' 213; the other eight prompts are not in this release, so `burgee migrate` does not rewrite `@inquirer/prompts` yet. caique's tarball no longer ships a test fixture or the declaration files no entry point reaches. `burgee migrate` knows the new names `caique/inquirer` exports.
