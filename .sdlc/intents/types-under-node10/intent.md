# Intent — every drop-in subpath type-checks under `moduleResolution: node10`

**Status:** shipped · **Opened:** `2026-10-18` · **Owner:** `@ofri-peretz` · **Shipped:** 2026-10-19 on
[`c05c86e2`](https://github.com/ofri-peretz/burgee/commit/c05c86e2) (#1130), released in burgee 1.6.2, verified against `main` at
[`add9c3fd`](https://github.com/ofri-peretz/burgee/commit/add9c3fd) — criteria 1 and 2 locked by `scripts/declaration-reach.test.ts`; criterion 3 by tsc-alias at
`1077308b` against burgee 1.6.2 (`spec.md` › Build status)

---

## What is wanted

A TypeScript project on `moduleResolution: node` / `node10`, or on `module: commonjs` with no
resolution set, type-checks with `import … from 'burgee/commander'`. The same holds for every
other drop-in subpath of the family (`burgee/yargs`, `roundel/chalk`, `flagstaff/ora`,
`caique/…`). Today such a project fails with `TS2307: Cannot find module`, because `node10`
ignores `exports`, and no family package ships `typesVersions`.

## Why now

From [`adoption-barriers-2026-10.md`](../../research/adoption-barriers-2026-10.md), barrier 4:

- **Share.** 38.8% (31.8–46.3%, n = 170) of the TypeScript repositories of commander and yargs
  dependents resolve as `node10` or `classic`. That is 25.8% of all repositories cloned. For yargs
  dependents it is 63.1%.
- **Field trial.** The TS2307 error appeared in **2 of 2** TypeScript CommonJS projects: tsc-alias
  (`moduleResolution: "node"`) and @swc/cli (`module: "commonjs"`). In both, the runtime
  `require()` of the drop-in worked on Node 22. Only the types failed.

## Affected users and systems

- Every published family package with a subpath export: its `package.json` gains a
  `typesVersions` map.
- `scripts/check-published-artifacts.ts` and the tarball declaration checks
  (D-20261011-tarball-unreachable-declarations).

## Constraints

- **No change to `exports`.** Modern resolution must keep reading exactly what it reads today.
- **No duplicated `.d.ts`.** The map points at the files already shipped.
- **No new runtime files.**

## Success criteria

- A fixture project with `"module": "commonjs"` and no resolution set, importing every drop-in
  subpath, passes `tsc --noEmit`. It fails on the code before the change.
- The same fixture under `node16`, `nodenext` and `bundler` still passes.
- tsc-alias at `1077308b`, with the specifier moved by hand, type-checks.

## Scope, decided here

- **Where the lock lives.** In the tarball check that already resolves every declaration
  (D-20261011-tarball-unreachable-declarations), so one place covers every package. Rejected: a
  fixture per package, which ten packages would each have to remember.

## Open questions

None.
