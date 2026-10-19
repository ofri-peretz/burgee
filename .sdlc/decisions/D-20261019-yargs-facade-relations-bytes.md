---
id: D-20261019-yargs-facade-relations-bytes
subject: '`burgee/yargs` pays 424 bundled bytes so a yargs program''s conflicts, implies and examples reach `--schema` and `--mcp`'
taken: 'Taken — on the owner''s delegation of 2026-10-12 over budgets and trade-offs'
date: '2026-10-19'
superseded_by: —
---

**`burgee/yargs`'s bundled ceiling (`benchmarks/axes/weight.ts`) moves from 108,420 B to
108,850 B, and its `./yargs` walk budget (`packages/burgee/src/weight.test.ts`) from 220,900 B to
221,700 B. Nothing else moves.**

## Value gained

`facade-projection-fidelity` R4, a live defect. A program moved to `burgee/yargs` declared
`.conflicts()`, `.implies()` and `.example()`, and all three were dropped before `--schema`,
`--mcp`, completions and help saw the manifest. The commander façade already projects its
conflicts. So an agent reading a yargs program's tool definition was told that two flags could
be combined when the program refuses that, and was told nothing about a flag that needs another.
It also got no example to build a first call from, and clispec 0.3 builds its output probe from
those examples.

They now project in the manifest's own vocabulary: `.conflicts()` as `exclusive`, `.implies()` as
`dependsOn`, and `.example()` as `examples`, with `$0` spelt as the program and an empty
description left out. A relation declared on an alias, or naming one, lands on the canonical key.
A positional count, a `--no-x` negation and a dotted key are yargs forms, not options, and are
left out. `facade-surface.test.ts` holds each case.

## Bytes paid, measured on clean builds (`rm -rf packages/burgee/dist`, then build)

| | main at `6b90ffe` | this change | delta |
| :-- | --: | --: | --: |
| `burgee/yargs` bundled (B4) | 108,345 | 108,769 | +424 |
| `./yargs` walk | 220,765 | 221,617 | +852 |

Each ceiling is the measurement plus the ~32 B CI reads heavier than a local build, rounded up to
the next 50 B. That is the rule D-20261018-commander-14-budget used. The walk grows more than the
bundle because it counts unminified `dist/` bytes.

## Why the ceilings move, and why no bytes were found first

The projection costs about 250 B minified in `yargs/burgee.js`, about 100 B in the snapshot that
`yargs/factory.js` takes, and 25 B for `getExamples` in `yargs/usage.js`. I measured the
alternatives against that. Folding the two relation passes into one loop over
`[field, map]` pairs is about 20 B longer. Moving the key check into the shared `skipped`
predicate breaks even. Dropping the alias resolution saves about 40 B, but then a relation
written against `-f` would silently project nothing, and that is the defect this change exists
to close. The relations half and the examples half each exceed the 75 B of headroom on their own,
as the 2026-10-12 attempt found. Half the fix would still need a raise.

## What yargs weighs

yargs 18 bundles at **111,686 B** by the same method. `burgee/yargs` stays **2,917 B lighter**
(ratio 0.974, against the `lighter-than-yargs` bar of ≤ 1), and against yargs plus cosmiconfig,
exit-hook and restore-cursor (198,784 B) it is 0.547. The claim keeps its margin.

## The control band

`yargs-front-end-bundled-bytes` will read a step of +424 B. Its breach intent,
`control-band-yargs-front-end-bundled-bytes`, is `dropped`
(D-20261018-drop-band-yargs-front-end-bytes), so the watcher writes nothing new while that
directory exists (gap A-20261018-dropped-band-intent-masks-breach). This file is the attribution
for the step.

## Reversal path

Revert the R4 lines in `packages/burgee/src/yargs/burgee.ts` (the `related` pass and the
`examples` spread), the three snapshot fields in `yargs/factory.ts`, and `getExamples` in
`yargs/usage.ts`. The four `facade-projection-fidelity R4` cases in `facade-surface.test.ts` then
fail, and both ceilings can return to 108,420 and 220,900. Choose that only if the bytes buy a
different fix with more value. The defect would come back with it.
