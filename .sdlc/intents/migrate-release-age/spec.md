# Design — `burgee migrate` prints an install that a release age lets through

Intent: [`intent.md`](./intent.md). **Status:** shipped (2026-10-19). The design is the owner's request of
2026-10-11.

---

## Requirements

- **R1.** With a release age set, each family package in `next` is pinned with a caret at the
  newest `x.y.z` release of its graded major whose publish time (the registry's `time`) is at
  least `minutes` old. Within the major, never below the first release that exports every subpath
  the rewrite imports: that floor is [`migrate-pins-carry-the-drop-in`](../migrate-pins-carry-the-drop-in/spec.md)'s,
  and it is the one gap R1 as first written left open (svgo, roundel 1.0.4).
- **R2.** Prereleases and other majors are never chosen.
- **R3.** A package that `minimumReleaseAgeExclude` names, or matches by glob, keeps its graded
  pin. A `name@a || b` entry makes those versions installable at once.
- **R4.** No version of the graded major old enough yet: pin the one that becomes old enough
  first, and say when, in UTC.
- **R5.** The registry does not answer: the graded pin, and a note that says the registry was
  not read.
- **R6.** No release age: the registry is never asked.

## Design

`releaseAgeOf` also reads the exclude list from the same file: a YAML block or flow list, or
`minimum-release-age-exclude[]=` lines. `pinsUnder` asks `options.registry`, which defaults to
`fetch('https://registry.npmjs.org/<name>')` with a five-second timeout, for each family
package being added. It picks the floor per R1 to R4. `nextStep` gets the graded versions
overlaid with the floors. `releaseAge` carries `exclude`, `pins`, and one note. `options.now`
and `options.registry` are the test seams, as `options.status` already is.

## Verification

`npx vitest run src/migrate-u12.test.ts` in `packages/burgee`, the `U12-2 — under a release
age` block. Its six registry cases fail on the code before this change. That was checked by
setting `migrate.ts` aside and running them: 6 failed, 57 passed.

### Checks, per requirement

| R | Check: `migrate-u12.test.ts` › |
| :-- | :-- |
| R1 | `pins the caret floor to the newest release of the graded major that is old enough`; `orders two old-enough releases of one minor by patch, and pins the newer` |
| R2 | the first case's `never a lower major, never a prerelease` |
| R3 | `keeps the graded pin for a package minimumReleaseAgeExclude exempts, as %s` (block list, flow-list glob, exact version, and `name@a \|\| b`, added 2026-10-19 and shown red against an entry read whole and one split untrimmed); `reads the exclusions from %s` |
| R4 | `says plainly when no version is old enough yet, and when one will be` |
| R5 | `falls back to the graded pins, and says why, when the registry does not answer`; `U12-2 — the public registry, when no registry is injected` |
| R6 | `never asks the registry when the project sets no release age` |

## Rejected alternatives

- **Print the graded pin and tell the maintainer to exempt the family.** That is what shipped,
  and it blocked mcpc: changing a project's supply-chain policy is not ours to ask.
- **Pin exactly (`roundel@1.0.1`).** A caret lets the project take the graded version once it
  is old enough, without anybody re-running migrate.
- **A semver dependency.** Rule 2. Releases here are `x.y.z`, and prereleases are skipped.

## Out of scope

- A registry other than npmjs.org (`registry=` in the npmrc). Publish times are read from
  npmjs.org whatever the project's registry is. The `ponytail:` comment in `migrate.ts` names
  this.
- npm's and yarn's own age settings, which `releaseAgeOf` did not read before either.
