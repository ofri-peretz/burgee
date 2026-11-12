---
id: D-20261112-typescript-7-does-not-typecheck-yet
subject: 'TypeScript 7 type-checks the repository five times faster than 6.0 and cannot build it. Should 7.0 run `typecheck` while 6.0 keeps the build?'
taken: 'Taken by the owner, 2026-11-12, accepting the recommendation in intent typescript-matrix ("ok lets execute") on chore/typescript-matrix (#1533)'
date: '2026-11-12'
superseded_by: —
---

**No. One compiler, the 6.0 line, runs the type-check, the emit, the build scripts and lint.
TypeScript 7 stays a line the published declarations are graded under, and nothing else.**

**What it would buy.** `tsc --noEmit` on `packages/burgee` (585 files) takes 2.24 s on 6.0.3 and
0.41 s on 7.0.2, measured 2026-11-12 on `a643df081c`.

**Why not.** Two compilers in the gate can disagree, and then a push fails for a reason that is
not in the code. The type-check is also not where the time goes: the pre-push battery is minutes
of tests and builds, and the type-check of the largest package is two seconds of it.

**When this is reopened.** When 7.0 can also build: `typescript-eslint` ships a peer range that
admits it, and the 27 files that import the compiler API (three of them steps of every package's
`build`) have an API to import. That is a new intent, and it decides the 28 declaration files 7.0
emits differently as a release.
