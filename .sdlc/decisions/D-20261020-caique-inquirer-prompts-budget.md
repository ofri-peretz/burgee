---
id: D-20261020-caique-inquirer-prompts-budget
subject: 'With all ten `@inquirer/prompts` prompts at `caique/inquirer/prompts`, the subpath measures 63,105 B against its 38,000 B budget and caique''s tarball is 10.7% over its recorded figure. Raised, or trimmed first?'
taken: 'Raised, on the owner''s delegation of budgets and baselines (2026-10-12): `./inquirer/prompts` 38,000 -> 65,000 B in `weight.test.ts`, and caique''s tarball figure 71,767 / 246,099 -> 79,416 / 288,332 B'
date: '2026-10-20'
superseded_by: —
---

**Both raised, to what is built.** The two numbers measure different things and both moved for the
same reason: `inquirer-prompts-drop-in` R3's other eight prompts, which take the `inquirer-prompts`
row from 100 / 213 to 213 / 213, level with `@inquirer/prompts` 8.7.3 on its own suites.

**The subpath budget** (`packages/caique/src/weight.test.ts`, the on-disk static graph of
`./inquirer/prompts`). D-20261012-caique-inquirer-prompts-subpath set 38,000 B for `select` and
`checkbox` (36,586 B). With `input`, `confirm`, `password`, `number`, `expand`, `rawlist`,
`search`, `editor` and `bellpull/cross-spawn` it measures **63,105 B**; the budget is 65,000. The
ceiling it is held under is the incumbent: `@inquirer/prompts` 8.7.3 with the ten prompt releases
it shipped with and `@inquirer/core` 12.0.4 bundles to **582,754 B** by `/docs/weight`'s method
(`esbuild --bundle --minify --format=esm --platform=node` over `export * from`), measured
2026-10-20 from a scratch install of exactly that tree; ours bundles to **47,960 B** (0.082), and
`scripts/subpath-weight-lock.test.ts` now holds that row at or under the incumbent. For scale,
`./clack`'s twelve prompts have a 64,000 B budget in the same file. A program on
`@inquirer/core`'s hooks (`caique/inquirer`) and a program on caique's own API load none of it:
`./inquirer`'s 23,000 B budget and every other entry's budget are unchanged.

**The tarball figure** (`.sdlc/bands/artifact-size-baseline.json`, `check:artifacts`, 10%
allowance). After `npm run weight:converge` on a clean build, caique packs to **79,416 B gzipped,
288,332 B unpacked**, 77 files: +10.7% and +17.2% against 71,767 / 246,099. The new files are
about 35 KB of it unpacked (`dist/inquirer-input`, `inquirer-keyed`, `inquirer-search` and
`inquirer-editor`, each `.js` and `.d.ts`), and the README's regenerated badge, family
and weight lines most of the rest. caique's unpacked pack was already above its figure on main from
drift under the allowance (D-20261020-declaration-summaries-tarball left it there).

**Trimmed first, and why nothing else goes.** The declarations already ship as summaries
(`declaration-summaries`), and `declaration-reach` prunes what no export reaches. What remains is
the eight prompts' code and the types `facade-types.test.ts` and `drop-in-type-surface-lock.test.ts`
require, name for name, against `@inquirer/prompts`. Moving the prompts to a second package was
rejected: D-20261012 chose a subpath so one install carries both prompt surfaces, and a program that
does not import `./inquirer/prompts` loads none of it.

**What the incumbents install for the same surface** (D-20261012-caique-tarball-rebaseline's
table): `@inquirer/prompts` 8.7.3 is 351,286 B gzipped across 25 packages; caique's tarball now
carries both it and `@clack/prompts`' surface at 79,416 B, plus `bellpull` (new, for `editor`'s one
process, which `inline-implementation-lock` sends to the family's spawn rather than
`node:child_process` by hand).

**Reversal.** Lower either figure to the next measured value; lowering needs no permission. If the
owner judges the raise wrong, `editor` is the one prompt that could leave the subpath (about 5 KB
unpacked and the `bellpull` edge), at the cost of `burgee migrate` refusing every file that imports
it.
