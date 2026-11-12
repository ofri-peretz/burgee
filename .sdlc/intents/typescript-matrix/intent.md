# Intent — the repository builds on TypeScript 6.0, and its packages are graded under 5.9, 6.0 and 7.0

**Status:** approved · **Opened:** `2026-11-12` · **Owner:** `@ofri-peretz`

Opened on the owner's instruction of 2026-11-12: "We need to move to higher TS. we can support
multi TS versions." The product half of that is in the `apicontract` intents. This is the
repository's own toolchain.

---

## What is wanted

Two things, each a check.

1. **The repository builds and type-checks with the newest TypeScript that can build it.** That is
   the 6.0 line, as measured below.
2. **"Works under several TypeScript versions" is a lock.** Every declaration a published package
   exports type-checks under the `tsc` of each of TypeScript 5.9, 6.0 and 7.0, in every resolution
   setting that line still has, with `skipLibCheck` off.

## Why now

On `main` at `a643df081c` the root pinned `typescript: ^5.7.0` and installed 5.9.3. npm's `latest`
tag for `typescript` is 7.0.2, and 6.0.3 is the last release of the compiler written in JavaScript.
An adopter who runs `npm install typescript` today gets a compiler the repository had never run.

Measured 2026-11-12 on that commit, with each compiler installed beside the tree and the build
from 5.9.3 in place. The commands are in § How it was measured.

### The repository's own code, per version

| | 5.9.3 | 6.0.3 | 7.0.2 |
| :-- | :-- | :-- | :-- |
| `typecheck` script of each of the 31 workspaces that has one | 31 pass | 31 pass | 31 pass |
| `tsc -p tsconfig.build.json` in each of the 13 packages | 13 pass | 13 pass | 13 pass |
| Emitted `.js`, against 5.9.3 | the baseline | identical, every file | identical, every file |
| Emitted `.d.ts` (361 files), against 5.9.3 | the baseline | identical, every file | **28 differ**, in 10 packages |
| `import ts from 'typescript'` (27 files) | works | works | **fails**: the package exports `version` and nothing else |
| `typescript-eslint` 8.72 peer range `>=4.8.4 <6.1.0` | inside | inside | **outside**: `npm install` fails ERESOLVE |
| `tsc --noEmit` on `packages/burgee` (585 files) | 2.20 s | 2.24 s | 0.41 s |

No source file needs an edit for either newer line. `tsconfig.base.json` already sets what 6.0
changed the defaults of (`module` and `moduleResolution: NodeNext`, `strict`, an explicit `target`
and `types`), so 6.0 reports no deprecation.

What breaks is not the type-check. It is everything that uses the compiler as a library, which
TypeScript 7 does not ship (its only stable export is the version; the rest is under `unstable/`):

- **The build itself, 3 files.** `scripts/strip-comments.mjs`, `scripts/declaration-reach.mts`
  and `scripts/declaration-summaries.mts`. The first two are steps of every published package's
  `build` script.
- **Page generators, 2 files.** `scripts/api-reference.ts`, `scripts/plugins-page.ts`.
- **oxmutate's compat harness, 1 file.** `packages/oxmutate/compat/expect-mutation.ts`.
- **Tests and locks, 21 files.** Ten under `scripts/` and eleven in packages (the `weight.test.ts`
  of seven packages among them).
- **Lint.** `@typescript-eslint/parser` and its plugin need the API, and their peer range stops
  below 6.1.

The 28 declaration files 7.0 emits differently: 25 differ only in the quote character of string
literal types (7.0 keeps the source's quotes; 5.9 and 6.0 print double quotes). Three differ in
shape: `bellpull/node-which.d.ts` (a function's expando property becomes an `export` in a merged
namespace), `caique/clack-output.d.ts` and `paratext/ansi-escapes.d.ts` (object members become
`typeof` references to hoisted declarations, and their order changes). None was checked for
equivalence here, because nothing proposes publishing 7.0's emit.

### The published declarations, per consumer

One consumer imports the root and every typed subpath of every published package (117
specifiers) and is compiled by each line's own `tsc`, `skipLibCheck: false`, `target: es2023`.
The setups are the five of `types-under-node10` R4.

| consumer setup | 5.9.3 | 6.0.3 | 7.0.2 |
| :-- | :-- | :-- | :-- |
| `module: commonjs`, no `moduleResolution` | `TS2307` on `vite`, known | clean | clean |
| `moduleResolution: node10` | `TS2307` on `vite`, known | `TS5107`: deprecated. Clean with `ignoreDeprecations: "6.0"` | `TS5108`: the option is removed |
| `node16`, ESM consumer | `TS1471` in closeout | `TS1471` in closeout | `TS1471` in closeout |
| `nodenext`, ESM consumer | clean | clean | clean |
| `bundler` | clean | clean | clean |

Three readings:

- **No version-specific defect.** Nothing in a published `.d.ts` is read by one line and refused
  by another.
- **One defect on every line, new to this intent.** `closeout/signal-exit`'s CommonJS declaration
  `require`s an ES module, which `module: node16` refuses.
  `declaration-reach.test.ts` imports the same specifier under `node16` and passes, because it
  reads resolution codes only. It is gap
  [`A-20261112-closeout-signal-exit-dcts-node16`](../../gaps/A-20261112-closeout-signal-exit-dcts-node16.md).
- **`node10` is ending upstream.** The setting `types-under-node10` was built for needs a flag on
  6.0 and does not exist on 7.0. Under 6.0 and 7.0, `module: commonjs` with no resolution set
  reads `exports`, so those adopters no longer depend on `typesVersions`. The 5.9 line still does.

### How it was measured

- Compilers: `npm install typescript@<version>` in three empty directories.
- Type-check: each workspace's own `typecheck` script, run from its directory with that
  compiler's `tsc` first on `PATH`. 93 runs, 93 exit 0.
- Emit: `tsc -p tsconfig.build.json --outDir <scratch>` per package and compiler, then `diff -rq`
  against the 5.9.3 tree.
- Library use: `rg "from ['\"]typescript['\"]"`, and `import('typescript')` under 7.0.2.
- Consumers: now `scripts/typescript-matrix.test.ts`.

## Affected users and systems

- **Root `package.json` and `apps/docs-chassis/package.json`:** `typescript` moves from `^5.7.0`
  to `^6.0.3`. Root gains `typescript-5.9` and `typescript-7.0`, npm aliases held to their minor
  line with `~`. The lockfile gains those two and 7.0's 20 platform packages.
- **`scripts/typescript-matrix.test.ts`:** new, in the root suite, so it runs in pre-push and in
  `Quality (Full) Gate` with no workflow change.
- **`.github/dependabot.yml`:** the `typescript` ignore moves from `>=6` to `>=6.1`, and the two
  aliases are held to their lines.
- **`README.md`:** the badge reads "TypeScript 5.9+", the oldest line graded.
- **No published package changes.** 6.0.3 emits the same bytes as 5.9.3, so no tarball moves and
  no changeset is owed.

## Constraints

- **No published byte changes** from the compiler move. A different emit is a release, and is
  decided as one.
- **One compiler builds.** The type-check, the emit, the build scripts and lint read the same
  TypeScript, so a green local run and a green CI run mean the same thing.
- **A graded line is named, not floated.** An alias is one minor line. A new TypeScript minor is
  a new alias and a new row, added on purpose.
- **The matrix reads every diagnostic.** An excused diagnostic is listed by code, file and
  consumer in the lock, with its reason, and nowhere else.

## Success criteria

1. `node_modules/.bin/tsc --version` at the root prints `Version 6.0.x`, and `npm run ci:local`
   and `npm run lint` pass.
2. `scripts/typescript-matrix.test.ts` passes: 14 compiler-and-consumer cells, each with no
   diagnostic outside `KNOWN`, and one case per line holding the alias to the version its name
   says.
3. The lock fails on the unfixed state. Shown three ways on 2026-11-12: with the `TS1471` entry
   removed from `KNOWN`, the three `node16` cells fail and print closeout's diagnostic; with a
   compiler path that does not exist, all 17 compiler cases fail; with no `target` in the
   consumer, 5.9 fails on `TS18028` in four family declarations.
4. `KNOWN` holds two entries on the day this lands, and the count only falls.

## Scope, decided here

- **The build moves to 6.0, not 7.0.** 7.0 type-checks the tree and is five times faster on
  burgee, but it cannot run the build: three build scripts, two page generators and 21 tests
  import a compiler API it does not have, `typescript-eslint` refuses to install beside it, and
  its declaration emit differs in 28 files, which would be a release of ten packages. 6.0 costs
  nothing: no source edit, no changed byte, every tool inside its peer range. Moving to 7.0 is
  its own intent, and it starts when `typescript-eslint` ships a peer range that admits it.
- **The matrix is a lock in the root suite, not a workflow.** That is where `types-under-node10`
  put its consumer matrix, for the reason that intent gives: one place covers every package, and
  a new package is covered without anyone remembering to add it. The compilers are devDependencies
  under the lockfile, so the lock runs offline and the same on a laptop as in CI.
- **The cells compile at once, in the file's setup.** One after another they took 29 s, and the
  slowest case 4.7 s against the 5 s case budget (D-20261101-tests-under-5s). Together the file
  takes 6 s.
- **closeout's `TS1471` is excused, not fixed here.** It predates this intent, it is on every
  line, and its fix touches a published declaration. It has its own gap.

## Open questions

None. Two were raised and closed on 2026-11-12:

- ~~Which floor the README states, 5.7+ as written or 5.9 as graded.~~ Decided: 5.9, and the badge
  says so ([D-20261112-typescript-floor-is-5-9](../../decisions/D-20261112-typescript-floor-is-5-9.md)).
- ~~Whether 7.0 runs the repository's `typecheck` while 6.0 keeps the build.~~ Decided: no, until
  7.0 can also build
  ([D-20261112-typescript-7-does-not-typecheck-yet](../../decisions/D-20261112-typescript-7-does-not-typecheck-yet.md)).
