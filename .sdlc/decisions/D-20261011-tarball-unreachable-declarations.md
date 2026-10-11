---
id: D-20261011-tarball-unreachable-declarations
subject: 'burgee''s tarball sat 211 B under its ratchet with clispec-conformance (#1018) still to land at +4,397 B. Raise `artifact-size-baseline.json`, or ship less?'
taken: Taken — owner's default, owner-reversible
date: '2026-10-11'
superseded_by: —
---

**Ship less. Every published package stops publishing the declaration files no `exports`
entry can reach, and no ratchet is raised.** The owner's default, given with the brief for
clispec-conformance on 2026-10-11.

**Why there was anything to prune.** `tsc` emits a `.d.ts` beside every module, and
`files: ["dist", …]` published all of them. A TypeScript consumer opens only what its resolver
reaches from an entry point. In burgee that left 35 declaration files nobody's compiler could
open, among them `migrate.d.ts` (the codemod's internals) and `clispec.d.ts`. They cost
download and disk and bought nothing, because a deep import is refused by `exports` anyway.

**What is reachable, and how it is proven.**

- **The rule.** `scripts/declaration-reach.mts` starts from each `types` target in `exports`,
  the declaration beside each JavaScript target that has none, `types` / `typings`, the one
  beside `main`, and every `typesVersions` mapping. It asks TypeScript's own program (`NodeNext`,
  the resolution every package builds with) which declaration files inside the package it
  loads. That is the transitive closure as the compiler computes it: imports, re-exports,
  `import()` types, `/// <reference path>`, directory indexes, and self-references by package
  name (`burgee/commander` inside burgee). It is not a regex over import lines.
- **Where it runs.** It is the last step of every published package's `build`
  (`… && node ../../scripts/declaration-reach.mts --prune`), so `dist/` and the tarball agree
  and there is no hand-typed list to drift.
- **The checks.**
  - `scripts/declaration-reach.test.ts` builds a package on disk per edge kind and asserts each
    one is followed. Per published package it asserts that the build ends with the prune and
    that the built `dist/` holds no declaration outside the closure. Red before the build
    change: `expected [ 'dist/agent-format.d.ts', …(34) ] to deeply equal []` for burgee, and
    the same for all ten.
  - `scripts/pack-list-lock.test.ts` › `ships every declaration file its shipped declarations
    import` is the independent check. It reads the syntax tree of every declaration in
    `npm pack --dry-run`'s list and requires each relative specifier to name a packed file. It
    does not use the pruning code. Deleting a reachable file (`dist/manifest.d.ts`) turns it
    red with 30-odd `… -> ./manifest.js` lines.
  - The TypeScript-consumer locks stayed green with no change: `facade-types.test.ts`,
    `drop-in-type-surface-lock.test.ts`, `drop-in-require-shape-lock.test.ts`,
    `api-reference-lock.test.ts` and `package-shape-lock.test.ts`.
- **End to end, once, by hand.** All ten packages were packed and the tarballs installed into an
  empty project. A file importing every one of the 98 `exports` entries with types was compiled
  with `skipLibCheck: false`. The compiler opened **190** declaration files from the tarballs,
  which is exactly the 190 they ship: nothing shipped goes unread, and no import went
  unresolved. The one error, `controlroom/dist/ink/react.d.ts` → `react-reconciler`, is the
  optional peer `controlroom/ink` declares. It is outside the package and is untouched by the
  prune.

**Bytes, before → after** (`npm pack --dry-run`, `main` at 49d8e943ce, same machine):

| package | files pruned | bytes pruned | gzipped tarball | unpacked |
| :-- | --: | --: | --: | --: |
| burgee | 35 | 76,504 | 251,814 → 225,278 | 942,421 → 865,969 |
| caique | 6 | 12,740 | 72,434 → 68,179 | 245,044 → 232,356 |
| controlroom | 8 | 9,402 | 83,242 → 79,987 | 333,754 → 324,404 |
| paratext | 4 | 5,685 | 39,011 → 36,818 | 121,533 → 115,900 |
| linegauge | 3 | 5,092 | 33,748 → 31,960 | 108,226 → 103,186 |
| flagstaff | 4 | 3,232 | 68,398 → 67,152 | 237,147 → 233,967 |
| seniority | 4 | 2,296 | 65,755 → 64,729 | 232,683 → 230,439 |
| bellpull | 3 | 1,860 | 37,383 → 36,576 | 117,462 → 115,654 |
| closeout | 2 | 751 | 40,656 → 40,231 | 128,845 → 128,146 |
| roundel | 2 | 750 | 37,404 → 37,027 | 107,444 → 106,746 |
| **total** | **71** | **118,312** | | |

It is a pure win in all ten. Every package's pruned set includes its `bin`'s `cli.d.ts`, which
no `exports` entry names, and most include `check.d.ts`. burgee's tarball goes from 9.9% over
its recorded 229,114 B to 1.7% under it, and the record follows it down.

**What moved with it.**

- `artifact-size-baseline.json` is **lowered** for the five packages that now pack under their
  recorded figures: burgee, caique, controlroom, linegauge and paratext. The other five shrank
  too but are still above their figures, from drift under the allowance, so they are left alone.
- The installed-size cell on the comparison page and the `vs/` pages goes from 1575 KB to
  1514 KB, measured on a clean `npm ci`.
- `foundation-ceilings.json`, the package READMEs and their docs pages carry the new
  installed bytes (`npm run weight:converge`).

**What is given up.** Nothing a consumer can import. A tool that reads `node_modules/<pkg>/dist`
by path and not through `exports`, such as an editor's go-to-source on a non-exported module,
now finds a `.js` with no `.d.ts` beside it, and that is the only behaviour that changes.

**Reversal.** Drop `&& node ../../scripts/declaration-reach.mts --prune` from the ten `build`
scripts. Delete the two `published package` cases in `declaration-reach.test.ts` that hold
it, and keep the edge cases. Then run `npx tsx scripts/check-published-artifacts.ts` and raise
the five lowered baselines in their own decision, since raising is the direction that needs
one.
