---
id: D-20261012-caique-inquirer-prompts-subpath
subject: 'Where do `@inquirer/prompts`'' prompts ship in caique, when `caique/inquirer` has a 23,000 B budget and caique''s tarball a 10% allowance that neither may be raised?'
taken: Taken
date: '2026-10-12'
superseded_by: —
---

**At a new subpath, `caique/inquirer/prompts`, and `usePagination` is not exported from `caique/inquirer` yet.** The intent's R4 names `caique/inquirer` as the drop-in for `@inquirer/prompts`; this changes that one specifier and nothing else in the design.

**The measurement (2026-10-12, at main 35ded07).**

- `caique/inquirer`'s static graph was 20,817 B against its 23,000 B budget (`packages/caique/src/weight.test.ts`). `usePagination` alone is 3,369 B of `dist`, so exporting it there measured 24,186 B, over the budget. `select` and `checkbox` add 12,274 B more. The budget is a bundled-bytes ratchet, and it is not raised.
- caique's tarball stood exactly at its recorded figure, 68,179 B gzipped and 232,356 B unpacked (`.sdlc/bands/artifact-size-baseline.json`), so the whole of R1 and R3 has 10% to live in.

**What follows.**

- `caique/inquirer/prompts` exports `select`, `checkbox`, `Separator` and their config, theme and choice types. It reaches `caique/inquirer`'s graph and adds the pagination, the shared list helpers and the prompts: 36,586 B of `dist`, held to 38,000 B by its own rule in `weight.test.ts`. A program on `@inquirer/core`'s hooks loads none of it.
- The `inquirer-prompts` host's prompt imports grade `caique/inquirer/prompts` (`subpath: '/prompts'`, `control: '@inquirer/prompts'`), and checkbox's `@inquirer/core` import still grades `caique/inquirer`, so `ValidationError` is the same class in both, as it is in a migrated program. `DROP_INS` follows: `@inquirer/prompts` → `caique/inquirer/prompts`.
- The choice types sit in a module of types alone (`inquirer-choice.ts`), so the shipped declarations reach them and `declaration-reach` prunes the helpers' declarations: 2,669 B that a consumer's types never read.
- `usePagination` stays internal to the prompts. D-20261011-inquirer-pagination-suite-is-selects said it would be exported from `caique/inquirer`; that is the part this decision defers. `burgee migrate` keeps refusing a file that imports `usePagination` from `@inquirer/core`, as it did before. Exporting it needs `./inquirer`'s graph 1,186 B smaller first, or a decision to price `@inquirer/core`'s whole surface differently.
