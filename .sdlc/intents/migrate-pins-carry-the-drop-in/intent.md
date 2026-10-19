# Intent — under a release age, `next` never pins a version that predates the drop-in

**Status:** shipped · **Opened:** `2026-10-18` · **Owner:** `@ofri-peretz` · **Shipped:** 2026-10-19 on
[`db0ad9b6`](https://github.com/ofri-peretz/burgee/commit/db0ad9b6) (#1124), released in burgee 1.6.2, verified against `main` at
[`add9c3fd`](https://github.com/ofri-peretz/burgee/commit/add9c3fd) — criterion 1 locked by `migrate-pins.test.ts`, criterion 2 by the svgo field trial re-run on
2026-10-19 (below)

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

## Where the criteria stand — 2026-10-18

**Status raised from `draft` to `approved`, not `shipped`:** the mechanism is built and one of the
two criteria is met by a check run green. The other cannot be run before a date.

- **The svgo shape, stubbed registry** — **met.** `packages/burgee/src/migrate-pins.test.ts`, first
  case: roundel 1.0.4 a month old, 1.1.0 six days old, a 7-day age. `next` is `pnpm add
  roundel@^1.1.0`, not `^1.0.4`, and the note names 2026-10-19 12:00 UTC (the fixture's clock) as
  the date 1.1.0 installs. Run against `migrate.ts` from `main` it printed `roundel@^1.0.4` and
  failed.
- **The field trial re-run on svgo with a 7-day age** — **met, 2026-10-19T11:08:13Z** (run by the
  coordinating agent; the evidence is recorded in `spec.md` › Field trial). `npx -y burgee@1.6.2
  migrate` on svgo `e4cb29be` under `minimumReleaseAge: 10080` printed `pnpm add roundel@^1.1.0 &&
  pnpm remove picocolors`; that line, run as printed, exited 0, and `node bin/svgo --help` exited 0.
  The control run at 10:59:58Z, before roundel 1.1.0 aged in, was refused by pnpm's release age as
  the note predicted. What 2026-10-18 recorded: roundel 1.1.0, the
  first release with `./picocolors`, was published 2026-10-12 11:07 UTC, so no roundel that carries
  the subpath passes a 7-day age before **2026-10-19 11:07 UTC**. The built CLI, run on 2026-10-18
  against the real registry on an svgo-shaped project, prints `pnpm add roundel@^1.1.0` and says
  exactly that date; today pnpm refuses that install, which is the intended answer, not a
  started-but-broken program. Re-run the trial (`adoption-barriers-2026-10.md` → Reproduce) on or
  after that date, with this change released; when `svgo --help` works, raise this to `shipped`.

## Open questions

None.
