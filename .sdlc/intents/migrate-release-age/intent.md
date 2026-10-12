# Intent — `burgee migrate` prints an install that a release age lets through

**Status:** approved · **Opened:** `2026-10-11` · **Owner:** `@ofri-peretz`

---

## What is wanted

When the project sets a pnpm release age (`minimumReleaseAge` in `pnpm-workspace.yaml`, or
`minimum-release-age` in an npmrc), the `next` command `burgee migrate` prints installs on the
day it is printed. Each family package is pinned to the newest published version of its graded
major that is at least that old. `minimumReleaseAgeExclude` is honoured. When no version is
old enough yet, the report says so, with the date one will be.

## Why now

The apify/mcpc adoption PR (U12, gap C3) was blocked by it. mcpc sets
`minimumReleaseAge: 4320`. `next` printed `pnpm add flagstaff@^<latest> roundel@^<latest>` and a
note that the install may fail. roundel 1.0.3 and 1.0.4 and flagstaff 1.2.4 and 1.2.5 were
docs-only patches, and each restarted the three-day clock, so the printed command never
installed while the family kept shipping (`npm view roundel time`: 1.0.1 on 10-08, 1.0.2 and
1.0.3 on 10-09, 1.0.4 on 10-10).

## Affected users and systems

- Any project under a release age that runs `burgee migrate`: mcpc today, mac-cleaner in U12-2.
- `packages/burgee/src/migrate.ts`: `next`, and `releaseAge` in the `--json` report, which
  gains `exclude` and `pins`.

## Constraints

- **Never a lower major.** `^0.6.2` is what the unpinned command saved on mac-cleaner, and it
  carries no drop-in (U12-2, D-20261008-migrate-u12-findings).
- **Zero dependencies.** The registry read is the global `fetch`; no semver package.
- **Offline is not a failure.** A registry that does not answer leaves the graded pins and says
  so. No test reaches the network.

## Success criteria

- On the mcpc shape (`minimumReleaseAge: 4320`, chalk and ora, a graded version a day old),
  `next` is `pnpm add flagstaff@^1.0.0 roundel@^1.0.0 && pnpm remove chalk ora` against a
  stubbed registry. The test fails on the code before the change.
- An exempt package keeps its graded pin: a block list, a flow-list glob and an exact version.
- With no version old enough, the note names the date and time one will be.
- `npx vitest run src/migrate-u12.test.ts` in `packages/burgee` is green.

## Open questions

- ~~Should a floor below the graded version be allowed at all?~~ Yes, within the major: it is
  the owner's request (2026-10-11). The note tells the maintainer to run their tests on it,
  because a patch below the graded one is not what the oracle graded.
