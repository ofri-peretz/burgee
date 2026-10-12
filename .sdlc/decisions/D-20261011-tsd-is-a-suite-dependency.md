---
id: D-20261011-tsd-is-a-suite-dependency
subject: '`extra-typings-drop-in` says `tsd` and `typescript` are workspace devDependencies for the grade. Where does the `tsd` runner get its tsd?'
taken: Taken
date: '2026-10-11'
superseded_by: —
---

**From the suite's own `suiteDeps`, pinned and installed into `vendor/<host>/node_modules`, never from the workspace.** The intent's constraint is kept in substance (tsd is never a dependency of a published package) and changed in where it lives, for two measured reasons.

**The root lockfile cannot take it from a Mac.** `npm install -D -E tsd@0.33.0` at the root on 2026-10-11 added 86 packages and also *removed* `@emnapi/core` and `@emnapi/runtime` from `package-lock.json`: optional platform packages a macOS resolution drops and a Linux `npm ci` needs. That is the lockfile the `Lockfile Sync` job and every CI install read, so a root devDependency is a lockfile change this lane cannot make safely. `suiteDeps` exists for exactly this (`hosts.ts`: "installed into `vendor/<name>/node_modules`, never into this workspace's manifest or lockfile").

**An unpinned tsd is whatever a walk up the tree finds.** The first draft of the runner resolved tsd from the vendored root and fell back to this package. With nothing installed beside a scratch suite, the run still graded: resolution walked up to an *extraneous* `node_modules/tsd` at the workspace root, left there by the reverted root install above and declared by no manifest. A clean `npm ci` would have read the same run as an error, so the row would have depended on the state of a laptop. That is the stray-store hole `unsatisfiedPins` closes for every other suite dependency (`run.ts`, the rc measurement of 2026-09-16). So a `tsd` host must pin `tsd` in `suiteDeps` or the run is refused, and the child resolves tsd from the vendored root only, where `installSuiteDeps` has put that exact version.

**The same reasoning covers `tsconfig.json`.** tsd's `findConfigFile` walks up as well, into `packages/compat-oracle/tsconfig.json`. A `tsd` suite with no `tsconfig.json` at its vendored root is refused; upstream's is vendored through `extraDirs`.

**What it costs.** The R1 fixture in `run.test.ts` installs tsd 0.33.0 and `@tsd/typescript` 5.9.3 from the registry into its scratch directory, once per run of that file, as `scripts/ink-alias-lock.test.ts` installs from the registry already.
