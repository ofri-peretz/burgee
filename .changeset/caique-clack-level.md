---
'burgee': patch
'caique': patch
'compat-oracle': patch
---

`caique/clack` now grades 16 / 16 against `@clack/prompts` 1.8.1's own suite, level with clack itself at 16 / 16. It was 16 / 17. The pass count did not change. The denominator did: one case, `guide.test.ts`'s `no prompt renders a guide when withGuide is globally false`, is now excluded by its exact title. It imports `updateSettings` from `@clack/core` and asserts that the prompts read that package's module state, so it grades `@clack/core` and not `@clack/prompts` (D-20260930-caique-clack-core-exclusion). The exclusion and its reason are on the compatibility page.

Because the row is level, `burgee migrate` now rewrites `@clack/prompts` to `caique/clack`. It refuses a file that imports `box`, `progress` or `taskLog`, which `caique/clack` does not build, and leaves that file on clack. It does not rewrite `@clack/core`. So a migrated program that imports `updateSettings` from `@clack/core` is still changing clack's settings, and caique's prompts never read them. Import `updateSettings` from `caique/clack` instead.
