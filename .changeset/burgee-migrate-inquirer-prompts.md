---
"burgee": minor
---

`burgee migrate` now rewrites `@inquirer/prompts` to `caique/inquirer/prompts`, which `@inquirer/prompts` 8.7.3's own suites pass 213 / 213, level with `@inquirer/prompts` itself. A file that imports a name the subpath does not export stays on `@inquirer/prompts`.
