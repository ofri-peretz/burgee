# Intent — under a release age, `next` never pins a version that predates the drop-in

**Status:** draft · **Opened:** `2026-10-18` · **Owner:** `@ofri-peretz`

---

## What is wanted

When a release age forces `burgee migrate` to pin below the graded version, the floor it picks
exports every subpath the rewrite introduced. If no version is both old enough and carries the
subpath, `next` says so, and says when one will be, instead of printing an install that leaves the
program unable to start.

## Why now

The 2026-10-18 field trial, barrier 7 in
[`adoption-barriers-2026-10.md`](../../research/adoption-barriers-2026-10.md):

- **What happened.**
  - svgo at `e4cb29be` sets `minimumReleaseAge: 10080`.
  - `burgee@1.6.0 migrate` rewrote three `picocolors` imports to `roundel/picocolors` and printed
    `pnpm add roundel@^1.0.4`, "the newest roundel 1.x old enough".
  - `roundel/picocolors` first shipped in roundel **1.1.0** (`npm view roundel@1.0.4 exports` has
    no `./picocolors`).
- **The result.**
  - `pnpm typecheck` failed 3 × TS2307.
  - 6 tests and 3 test files failed.
  - `svgo --help` threw `ERR_PACKAGE_PATH_NOT_EXPORTED`.
- **Why the intent above missed it.** [`migrate-release-age`](../migrate-release-age/intent.md)
  constrains the pin to "never a lower major". Within a major, a subpath can still be younger
  than the major.

## Affected users and systems

- Any project with a pnpm `minimumReleaseAge` or an `.npmrc` `minimum-release-age` that migrates
  to a subpath added after the major's `.0`. That covers `roundel/picocolors`,
  `roundel/supports-color`, the colour façades, and anything added in later minors.
- `packages/burgee/src/migrate.ts` (`pinsUnder`), and `scripts/family-versions.mjs`, which can
  record the first version of each subpath at build time.

## Constraints

- **Zero dependencies, offline-safe.** The same rules as `migrate-release-age`.
- **No new registry calls.** The first-version table is written at build time from the repository's
  own history, not fetched.

## Success criteria

- The svgo shape: a stubbed registry where roundel 1.0.4 is old enough and 1.1.0 is not. `next`
  does not pin `^1.0.4`. Its note names the date roundel 1.1.0 becomes installable. The test
  fails on the code before the change.
- Re-running the field trial on svgo with a 7-day age: the printed install, run as printed, leaves
  `svgo --help` working.

## Scope, decided here

- **Where the first-version table comes from.** The repository's own git tags. For each package
  tag, the `exports` keys of that tag's `package.json` are read at build time into
  `dist/family-versions.json`, beside the versions `scripts/family-versions.mjs` already writes.
  Rejected: reading the registry at run time, which `migrate-release-age` already rules out.

## Open questions

None.
