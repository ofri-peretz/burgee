# Design — the repository builds on TypeScript 6.0, and its packages are graded under 5.9, 6.0 and 7.0

Intent: [`intent.md`](./intent.md). **Status:** approved — accepted by the owner, 2026-11-12.

Grounded on `main` at `a643df081c`. The measurements are in the intent's § Why now.

---

## Requirements

- **R1 — One compiler builds, and it is the 6.0 line.** Root and `apps/docs-chassis` declare
  `typescript: ^6.0.3`. `.github/dependabot.yml` ignores `typescript` at `>=6.1`.
- **R2 — Each graded line is a named devDependency.** `typescript-5.9` is
  `npm:typescript@~5.9.3` and `typescript-7.0` is `npm:typescript@~7.0.2`. 6.0 is `typescript`
  itself. A case per line asserts that `tsc --version` prints the line its name says.
- **R3 — Every published declaration type-checks under every line.** One consumer imports the
  root and every typed subpath of every published package. Each line's own `tsc` compiles it with
  `skipLibCheck: false`, `strict` and `target: es2023`, under each consumer setup of
  `types-under-node10` R4 that the line still has.
- **R4 — Any diagnostic fails.** The exceptions are the entries of `KNOWN`, each a code, a file,
  the consumers it applies to and the reason.
- **R5 — A compiler that did not run fails.** A `tsc` that exits non-zero and names no diagnostic
  is reported as one.
- **R6 — No published byte moves.** 6.0.3 emits what 5.9.3 emits, so no package gets a changeset.

## Design

`scripts/typescript-matrix.test.ts`, in the root suite. The cells are compilers × setups:

| setup | 5.9 | 6.0 | 7.0 |
| :-- | :-- | :-- | :-- |
| `module: commonjs`, no resolution | yes | yes | yes |
| `node10` | yes | with `ignoreDeprecations: "6.0"` | no: the option is removed |
| `node16`, ESM consumer | yes | yes | yes |
| `nodenext`, ESM consumer | yes | yes | yes |
| `bundler` | yes | yes | yes |

Fourteen cells. One `beforeAll` gives each its own consumer directory and starts all fourteen
compiles at once; each case then reads what its compiler printed. Run one after another they took
29 s, with cases at 4.7 s against the 5 s budget (D-20261101-tests-under-5s). Together the file
takes 6 s.

`KNOWN` on the day this lands:

- `TS2307` on `vite` from `oxmutate/dist/vite.d.ts`, under `commonjs` and `node10`. The same
  exception as `declaration-reach.test.ts` › `EXPORTS_ONLY_PEERS`.
- `TS1471` in `closeout/dist/signal-exit.d.cts`, under `node16`. Gap
  [`A-20261112-closeout-signal-exit-dcts-node16`](../../gaps/A-20261112-closeout-signal-exit-dcts-node16.md).

## Verification

`npx vitest run --config vitest.root.config.ts scripts/typescript-matrix.test.ts`, after
`npm run build` (the consumer reads each package's `dist/`).

| R | Check | Shown failing first by |
| :-- | :-- | :-- |
| R2 | `TypeScript $line` › `is the line its name says, so a bump cannot quietly stop grading one` | a compiler path that does not exist: all three fail |
| R3, R4 | `TypeScript $line` › `type-checks every published declaration: $name` | the `TS1471` entry removed from `KNOWN`: the three `node16` cells fail and print closeout's diagnostic |
| R3 | the same cases | no `target` in the consumer: 5.9 fails on `TS18028` in four family declarations |
| R5 | the same cases | a compiler path that does not exist: all fourteen fail with `tsc failed with no diagnostic` |
| R1, R6 | `npm run ci:local` and `npm run lint` | — |

## Rejected alternatives

- **Build on 7.0.** It cannot: no compiler API for 27 files, `typescript-eslint` will not install
  beside it, and 28 declaration files change
  ([D-20261112-typescript-7-does-not-typecheck-yet](../../decisions/D-20261112-typescript-7-does-not-typecheck-yet.md)).
- **A workflow with a version matrix that installs each compiler at run time.** The compilers
  would be outside the lockfile, the check could not run offline or in pre-push, and a required
  check would have to be added to branch protection. The root suite is already required.
- **Extend `declaration-reach.test.ts`.** It calls the compiler API of the one installed
  TypeScript, which 7.0 does not have, and it reads six resolution codes by design.
- **Lines 5.7 and 5.8**
  ([D-20261112-typescript-floor-is-5-9](../../decisions/D-20261112-typescript-floor-is-5-9.md)).

## Out of scope

- Fixing closeout's `TS1471`. It has its own gap.
- `apicontract`'s generated code under several TypeScript lines. That is in its own intents.
