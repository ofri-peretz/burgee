---
id: D-20261012-commander-14-budget
subject: 'What `burgee/commander/v14` may weigh, and why `burgee/commander` does not move'
taken: Taken
date: '2026-10-12'
superseded_by: —
---

**A new entry, `./commander/v14`, with its own budget of 113,950 B. `./commander` keeps 129,400
B, and its bundled ratchet on `/docs/weight` (56,418 B) does not move.**

`previous-majors` R1 needs commander 14's excess-arguments message, which stops at the count
where 15 names the surplus arguments. The spec's mechanism is a versioned subpath that
`burgee migrate` writes, never a version read at runtime. The behaviour could have been a
`major` field on the shared `Command`, but that would put 14's branch in every commander 15
program's bundle. The owner's rule for this wave is that previous-major support does not grow
the commander 15 path for users who don't need it. So the switch is a subclass in
`src/commander/v14.ts`: it overrides `_excessArguments` and `createCommand` (so subcommands
made by `.command()` carry 14's message too) and re-exports the rest of `burgee/commander`.
Nothing in `command.ts` changed. Commander 15 still grades 1360 / 1360 and extra-typings
369 / 369.

## The number

- `./commander/v14` reaches 113,893 B in `weight.test.ts`'s walk on a local build on
  2026-10-12, against `./commander`'s 113,206 B. The 687 B is `dist/commander/v14.js`, and its
  comments are already stripped.
- CI has read about 32 B heavier than a local build (the `./commander/extra-typings` rule
  records it), so the budget is 113,893 + 32 = 113,925, rounded up to the next 50 B:
  **113,950**.
- The local names were shortened (`args`, `forSub`) to fit under that boundary. Nothing
  else was traded.

## What a later change does with it

The entry follows `./commander`: any byte `commander-front-end-diet` removes from the shared
front-end comes off this entry too, and the budget is lowered with it. If yargs 17's subpath
(`previous-majors` R3, R4) is built the same way, it is priced the same way, as its own entry.

## The bundled number

On `/docs/weight` the entry bundles to **56,767 B**, against 56,418 B for `burgee/commander`
(+349 B) and **40,970 B for commander 14.0.3**, measured on 2026-10-12 by the page's own method
(`export * from 'commander'`, `esbuild --bundle --minify --format=esm --platform=node`). The same
run read commander 15.0.0 at 39,329 B, the figure already recorded, so the method agrees.
`subpath-weight-lock.test.ts` holds the entry in `OVER_INCUMBENT` with a ratchet at 56,767, under
the same gap as `burgee/commander` (`B-20261012-commander-front-end-bundles-heavier`): the
overage is that front-end's, not this entry's. `burgee/commander`'s ratchet is not raised.
