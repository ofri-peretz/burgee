# Intent — `@commander-js/extra-typings`, graded: commander's typed variant, on burgee

> Stage 1 artifact. Opened from the next-wave ranking
> ([`next-wave-2026-10.md`](../../research/next-wave-2026-10.md)): a 5 M-a-week package that
> `burgee migrate` cannot map, and an adoption target it cost.

**Status:** approved · **Opened:** 2026-10-12 · **Owner:** @ofri-peretz

---

## What is wanted

`burgee/commander/extra-typings` is a drop-in for `@commander-js/extra-typings`: commander's API
with option and argument types inferred from the declarations, so `.opts()` and the action's
parameters are typed without a cast. It is graded by extra-typings' own type-test suite through
`compat-oracle`, with a control run against the real package. `burgee migrate` rewrites the
import.

A TypeScript project on commander's typed variant gets the same one-import switch a plain
commander project already has.

## Why now

- **An adoption target was excluded for exactly this.** `adoption-targets.md`, "Excluded, and
  why": *"`orval` — Imports `@commander-js/extra-typings`, which `burgee migrate` does not map and
  the oracle does not grade."*
- **Demand.** `@commander-js/extra-typings`: **5,113,859** downloads a week
  (`api.npmjs.org`, 2026-10-03..09). These are the commander users who care most about types, the
  audience the TypeScript cluster speaks for: 18 open TypeScript-fidelity issues in yargs
  alone (`tracker-gap-analysis.md`).
- **It is in reach.** `npm view @commander-js/extra-typings` on 2026-10-11: version **15.0.0**,
  `peerDependencies: { commander: "~15.0.0" }`, the exact commander version the oracle grades at
  1,360 / 1,360. Its runtime *is* commander, so the runtime half is already graded. Its test
  script is `tsd`: the suite is type assertions, and grading it is a new runner for the oracle,
  not a new runtime.

## Affected users and systems

- `packages/burgee`: a new `./commander/extra-typings` subpath, made of types over
  `burgee/commander`'s runtime.
- `packages/compat-oracle`: a `tsd` runner and the vendored suite.
- `GRADED`, `GRADED_VERSIONS` and `DROP_INS` in `packages/burgee/src/compat.ts`; `burgee migrate`;
  the compatibility page.
- `scripts/drop-in-type-surface-lock.test.ts`, which already checks that a façade exports its
  incumbent's type surface.

## Constraints

- **The suite runs unedited**, apart from the import specifier.
- **A type grade is counted honestly.** A `tsd` "case" is one assertion (`expectType`,
  `expectError`, `expectAssignable`…). The runner reports each assertion that holds and each
  that does not. It never reports a file as one case.
- **Zero runtime dependencies.** `tsd` and `typescript` are workspace devDependencies for the
  grade, never package dependencies.
- **The runtime is not duplicated.** The subpath's JavaScript re-exports `burgee/commander`, as
  extra-typings re-exports commander. Only the declarations are new.
- **The types are a port, with the licence carried.** The inferred typings follow
  extra-typings' MIT declarations method for method, with its copyright notice, the way
  `burgee/commander` ports commander.

## Success criteria

1. `packages/compat-oracle` runs `tsd` suites and reports per-assertion results. Its own test
   proves the runner red on a deliberately wrong assertion.
2. `GRADED` carries an `extra-typings` row, level with its control or with every subtracted
   assertion named.
3. `burgee migrate` rewrites `@commander-js/extra-typings` in a TypeScript fixture, and
   `tsc --noEmit` passes on the result.
4. `scripts/drop-in-type-surface-lock.test.ts` and `scripts/migrate-drop-ins-lock.test.ts` pass
   with the new row.

## Open questions

- How a type-only suite is counted. **Answered 2026-10-12 in `spec.md`**: one case per `tsd`
  assertion, reported by the runner R1 adds, with the control proving the count.
