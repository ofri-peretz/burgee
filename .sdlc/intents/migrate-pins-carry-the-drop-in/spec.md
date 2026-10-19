# Design — under a release age, `next` never pins a version that predates the drop-in

Intent: [`intent.md`](./intent.md). **Status:** approved (2026-10-18, design acceptance delegated
by the owner for batch 1 of the roadmap-to-shipped program).

---

## Requirements

- **R1.** For each family package, the build records, for every subpath the current manifest
  exports, the oldest version of the current major from which every tagged release up to the
  current one exports that subpath. It reads the `exports` keys of `packages/<dir>/package.json`
  at each release tag (`<unscoped name>@<x.y.z>`) and writes them to `dist/family-versions.json`
  as `since`, beside the versions as `versions`.
- **R2.** A subpath that a release dropped and a later one brought back floors at the later one.
  A tag whose tree has no manifest is no evidence either way. Prereleases, other majors and
  versions newer than the current one are ignored.
- **R3.** A checkout without tags floors every subpath at the current version, and says so on
  stderr. `--require-tags` makes that an error, and `release.yml` passes it: the table that
  ships is read with full history.
- **R4.** Under a release age, the floor `next` pins for a package is never older than the highest
  `since` of the subpaths the rewrite imports from it. A subpath the table does not name floors at
  the graded version. A package the table does not name has no floor (run from source: the old
  behaviour).
- **R5.** When an older release of the major was old enough but lacks the subpath, the pin carries
  `requires: { specifiers, since }` and the note names the subpath and the version it first shipped
  in. With nothing both old enough and carrying it, the note names the date the first one that does
  becomes installable: the existing R4 of `migrate-release-age`, with the floor applied.
- **R6.** No registry call is added; the table is read from the repository's own history at build
  time.

## Design

`scripts/family-versions.mjs` keeps writing the versions and gains `since`. For each public
package it lists the package's tags (`git tag --list '<name>@*'`) and reads every tagged manifest
in one `git cat-file --batch`, cutting each body by bytes because a description may not be ASCII.
`sinceOf` walks the tagged releases of the current major downwards from the current version and
stops at the first one that lacks the subpath. The file is minified, as `strip-comments.mjs` leaves
every shipped JSON file. The pure parts (`parts`, `compare`, `subpathsOf`, `sinceOf`, `historyOf`,
`familyTable`) are exported and the CLI runs only as `main`.

`migrate.ts`: `familyVersions` reads `versions` (a flat file still reads as before), and
`subpathFloors` reads `since`. `floorsOf` turns the rewrite's targets (`roundel/picocolors`) into
one floor per package. `pinsUnder` filters the major's releases to those at or above the floor
before it picks the newest old-enough one or the soonest. `options.since` is the test seam, as
`registry` and `now` already are.

`release.yml`'s build job now checks out with `fetch-depth: 0` and `fetch-tags: true`, and re-runs
the script with `--require-tags` after turbo, before the artifact is uploaded. Turbo's cache key
cannot see tags, so a burgee `dist/` restored from a shallow build would otherwise ship a table
that floors everything at the current version: safe, but it would undo the release-age pins that
`migrate-release-age` exists for.

### A model?

**No `.qnt`.** `JEV-AND-QUINT.md` asks for one when the design has states, ordering, concurrency,
retries or a deadline. This one is a pure function of three inputs read once (the table, the
registry's `time`, the clock): no state carries from one run to the next, and nothing interleaves.
The property that matters — the chosen floor is at or above every imported subpath's `since` —
is a filter over a finite list, held by the unit cases below and by Stryker over the changed lines.
The date the install starts working is already the deadline `migrate-release-age` R4 computes.

## Verification

- `npx vitest run src/migrate-pins.test.ts` in `packages/burgee`. The svgo case (a stubbed
  registry where roundel 1.0.4 is a month old and 1.1.0 six days old, under `minimumReleaseAge:
  10080`) **failed on the code before this change**: it printed `pnpm add roundel@^1.0.4`.
  With `migrate.ts` set back to `main` the file ran 7 failed, 4 passed; with this change, 11 of 11
  pass.
- `npx vitest run --config vitest.root.config.ts scripts/family-versions.test.ts`: `sinceOf`,
  `subpathsOf`, `historyOf` over a scratch repository with non-ASCII descriptions and a tag that
  predates the manifest, the script with and without tags, `--require-tags`, and the release.yml
  build steps.
- `src/migrate-cli.test.ts` holds the built file: `versions` equals every published manifest,
  every exported subpath has a floor in the current major no newer than the version, and wherever
  the checkout has roundel's tags, `./picocolors` floors at 1.1.0.
- **The built CLI against the real registry, 2026-10-18 20:40 UTC**, on an svgo-shaped project
  (`picocolors` imported, `minimumReleaseAge: 10080`): `next` is `pnpm add roundel@^1.1.0 && pnpm
  remove picocolors`, and the note says no roundel 1.x that exports `roundel/picocolors` is old
  enough until 2026-10-19 11:07 UTC, when 1.1.0 is.
- The real table found two more of the same shape: `burgee/commander/extra-typings` first shipped
  in 1.5.0 and `closeout/onetime` / `closeout/cli-cursor` in 1.1.0. Each would have been pinned
  below its subpath under a release age.

### Field trial, 2026-10-19 (intent criterion 2) — met

Run by the coordinating agent and recorded here as reported.
- **Setup:** svgo `e4cb29be` (pnpm 10.34.5; `pnpm-workspace.yaml` `minimumReleaseAge: 10080`),
  Node v24.13.0, macOS, `npm_config_ignore_scripts=true`.
- **2026-10-19T11:08:13Z:** `npx -y burgee@1.6.2 migrate` printed `complete: 3 files rewritten`,
  and a release-age note: roundel 1.1.2 is younger than the age, so `next` pins `^1.1.0`, the
  newest roundel 1.x old enough that exports `roundel/picocolors` (first in 1.1.0).
- `next: pnpm add roundel@^1.1.0 && pnpm remove picocolors`, run as printed, exited 0 and installed
  roundel 1.1.0.
- `node bin/svgo --help` exited 0 (`Usage: svgo [options] [INPUT...]`). `<svg …><rect width="10"
  height="10"/></svg>` piped through `svgo -i - -o -` gave the square back as one optimised `<path>` element, exit 0.
- **Control, 10:59:58Z**, before roundel 1.1.0 aged in: the same install was refused by pnpm's
  release age, as the note predicted.

## Rejected alternatives

- **Read the registry at run time** (the packument's `versions[v].exports`). `migrate-release-age`
  rules out new registry calls, and the packument for burgee is the full document for every
  version, which is the size this command avoids.
- **Pin the graded version whenever a subpath is involved.** Safe, but it throws away every pin
  `migrate-release-age` makes for mcpc's docs-only patches, where the root entry has been there
  since 1.0.0.
- **A table committed to the repository, refreshed by hand.** It goes stale the first release
  that adds a subpath, and the stale direction is the dangerous one.

## Out of scope

- A project whose package manager resolves a caret to something other than the newest old-enough
  version (yarn's own age settings), as before.
- Subpath patterns (`./locales/*`): a target under one floors at the graded version (R4).
