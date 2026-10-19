---
id: D-20261019-yargs-17-budget
subject: 'What `burgee/yargs/v17` and `burgee/yargs/v17/yargs` may weigh, and what `burgee/yargs` pays for them'
taken: Taken
date: '2026-10-19'
superseded_by: —
---

**Two new entries with budgets of their own: `./yargs/v17` at 224,750 B and `./yargs/v17/yargs`
at 225,000 B. `./yargs` keeps 221,700 B. It grows 36 B in `weight.test.ts`'s walk (221,617 ->
221,653) and 20 B bundled (109,127 -> 109,147), for the one seam the older major plugs into.**

`previous-majors` R3 and R4 need yargs 17's behaviour in three places where 18 changed it: the
string table, the `commandDir()` walk, and naming a command module after its file. The rule set
for commander 14 in D-20261012-commander-14-budget applies here too: previous-major support does
not grow the current major's path for users who don't need it. So all three live in
`src/yargs/v17-factory.ts`, which only the v17 entries reach. A subclass of `CommandInstance`
overrides `addDirectory` and `addHandler`, and a factory wrapper restores the table's locale
that 18's constructor resets. The one change outside it is in `command.ts`: `command()` builds
`shim.CommandInstance ?? CommandInstance`. The `CommandInstance` field on the platform shim is
optional and type-only, and 18 never sets it. That line is the 36 B.

## The numbers

- `./yargs/v17` reaches **224,695 B** in the walk on a local build on 2026-10-19. That is
  3,042 B over `./yargs`, and nearly all of it is `dist/yargs/v17-factory.js` (2,746 B with
  comments stripped). A first cut was 3,483 B over. It built the subclass with its own
  constructor and a second wrapper class, and folding both into one class inside `yargs17()`
  took 421 B off, and dropping an option the string table never read took 20 more. Measured + the ~32 B CI margin = 224,727, rounded up to the next 50 B:
  **224,750**.
- `./yargs/v17/yargs` reaches **224,919 B**: the entry above plus one function carrying three
  statics. Its budget is 224,951, rounded up to **225,000**.
- `./yargs` reads 221,653 B against its 221,700 budget. With the CI margin that is 221,685, so it
  fits, and the budget does not move.

The `require()` door, `dist/yargs/v17.cjs` (1.3 KB), is not on the walk, because the walk
follows the `import` condition. It is CommonJS on purpose: yargs 17's own suite busts the require
cache and needs a fresh evaluation, and an ES module never gives one (`previous-majors` R4).

## Against the incumbent

On `/docs/weight`, by the page's own method (`export * from X` plus its default, `esbuild
--bundle --minify --format=esm --platform=node`), measured 2026-10-19 from yargs 17.7.3 as
`compat-oracle` installs it:

| Specifier | yargs 17.7.3 | ours |
| :-- | --: | --: |
| `yargs` → `burgee/yargs/v17` | 84,475 | 110,312 |
| `yargs/yargs` → `burgee/yargs/v17/yargs` | 114,656 | 110,119 |

`burgee/yargs/v17/yargs` is lighter than what it replaces, and `subpath-weight-lock.test.ts`
holds it under `DROP_IN_CEILINGS`. `burgee/yargs/v17` is heavier than 17's ESM entry, and it is
held as an `OVER_INCUMBENT` ratchet under `B-20261019-yargs-17-entry-bundles-heavier`. The same
method reads yargs 18.2.0 at 111,698 B, and `burgee/yargs` at 109,147 B is under it, so the
overage is against 17's lighter ESM bundle and not something the v17 code adds.

## Installed size

The two entries add seven files to burgee's tarball, **6,956 B** in all (`npm pack --dry-run`).
The maps are not published, and `declaration-reach --prune` drops `v17-factory.d.ts`. Unpacked,
the tarball is 1,024,705 B. CI's installed-size walk (`benchmarks/docs.test.ts`) read **1690 KB**
on this branch's merge ref, against the 1650 KB the comparison page stated. That moved it past
the 2% band. The walk covers the family packages burgee installs and the merge ref carries
main, so the 40 KB also holds what main grew since the cell was last restated (#1039). This
change's own share is the 7 KB above. The cell and every page that quotes it (`README.md`,
`comparison.mdx`, the five `vs/` pages) now say 1690 KB. There is no generator for them.

D-20261008-install-bytes still holds, and this decision is taken under it. Nothing here claims
a lighter install. The pages state burgee's installed size as its largest and least flattering
number, and the bundled column stays the number to judge it by. Previous-major support costs
install bytes for every user, and that is accepted: it is 7 KB, and the alternative was a
separate package.
