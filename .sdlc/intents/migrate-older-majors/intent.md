# Intent — `burgee migrate` gives an off-major project a work list, not `nothing to rewrite`

**Status:** shipped · **Opened:** `2026-10-18` · **Owner:** `@ofri-peretz` · **Shipped:** 2026-10-25 on
[`7fe3b77e6f`](https://github.com/ofri-peretz/burgee/commit/7fe3b77e6f) (#1176), released in burgee 1.7.0 (npm, 2026-10-25T17:05Z, Version PR #1231), verified against `main` at
[`aff0c31f`](https://github.com/ofri-peretz/burgee/commit/aff0c31fdf) with burgee 1.7.1 from npm — all three criteria held by `migrate-majors.test.ts` (73 / 73) and the field re-run · design accepted under the owner's delegation, [`D-20261019-migrate-older-majors-design-accepted`](../../decisions/D-20261019-migrate-older-majors-design-accepted.md) · **Design:** [`spec.md`](./spec.md)

---

## What is wanted

When a project declares an incumbent on a major that burgee does not claim, `burgee migrate`
names every line that uses an API the claimed major removed or changed. Each one comes with the
incumbent version that removed it and the replacement. Today such a project gets
`nothing to rewrite` and an `offMajor` row, and nothing it can act on.

The list is a report. migrate rewrites nothing that it has not graded, so an off-major project
still gets no rewrite. What it gets is the work that stands between it and a rewrite, as data in
`--json` and as lines in the human report.

## Why now

[`adoption-barriers-2026-10.md`](../../research/adoption-barriers-2026-10.md) ranks this first by
a factor of two:

- **Share.**
  - 83.7% of the commander and yargs dependents sampled (1,860 of 2,223, npm search frame,
    2026-10-18) are on an older major than the one migrate claims.
  - Once [`previous-majors`](../previous-majors/intent.md) claims commander 14 and yargs 17,
    56.7% (1,261 of 2,223) still are.
  - For commander alone it is 61.1% (58.9–63.3%).
- **Field trial.**
  - migrate left 5 of 9 real CLIs untouched for this reason.
  - With the specifier moved by hand, 4 of those 5 crashed on start-up, each on an API its own
    incumbent later removed:
    - wait-port: `require('commander')` used as the program;
    - madge: `require('commander')` used as the program, first called for
      `program.storeOptionsAsProperties()`, which commander 15 still has on a Command;
    - tsc-alias: the multi-character short flag `-fe`;
    - qrcode: the yargs ≤17 singleton.
  - 3 of those 4 kept a green test suite, because their suites never start the binary. Nothing
    the project runs would have caught it.

## Affected users and systems

- Maintainers on commander ≤13 or yargs ≤16, and agents asked to migrate them.
- `packages/burgee/src/migrate.ts`: the `offMajor` rows gain `sites`.
- The migrate docs page: one section on what an off-major report means.

## Constraints

- **Zero runtime dependencies**, and the same token scanner migrate already uses. No AST library.
- **No rewrite without a grade.** The rows name lines; they never change them.
- **Every pattern is sourced.** Each removed API is cited to the incumbent's own changelog entry,
  so the list cannot drift into opinion.

## Success criteria

- On the four trial shapes above, cut down to fixtures, `--json` lists each crash site with its
  file, line, the version that removed the API, and the replacement. The test fails on the code
  before the change.
- A project on the claimed major gets no new rows.
- Re-running the 2026-10-18 field trial: every `manual`-arm crash is named in the `mig` arm's
  report before anyone moves a specifier.

## Scope, decided here

- **How far back.** Commander 7 to 13 and yargs 15 and 16 come first. Commander 7 to 13 cover
  84.9% of the off-major commander dependents in the frame (973 of 1,146). yargs 15 and 16 cover
  47.0% (54 of 115); the rest are on 14 or older, and those patterns follow only when a measured
  project needs them.
- **Where it lives.** In migrate, because migrate already reads the project, and an agent's path
  should be one command. Rejected: a separate `eslint-plugin-cli-floor` rule as the only home. A
  lint rule can later project from the same table.

## Open questions

None.

## Shipped — 2026-10-25

`burgee@1.7.0` is on npm (`"1.7.0":` `2026-10-25T17:05:01.964Z`, release run 40213249288), and its
changelog carries #1176 as a minor. npm matches `main` for all ten packages (checked 18:26 UTC).
Every criterion was re-read against the released code:

| Criterion | Evidence on release |
| :-- | :-- |
| 1. On the four trial shapes, cut down to fixtures, `--json` lists each crash site with its file, line, the version that removed the API, and the replacement; the test fails before the change | `migrate-majors.test.ts` **73 / 73** on `main` at `aff0c31f`. In the field, `burgee@1.7.1`'s `dist/cli.js` from npm on a wait-port clone at `16083537`: `offMajor` carries `{ file: bin/wait-port.js, line: 4, api: module-as-program, removedIn: 12.0.0, replacement: const { program } = require('commander'), firstUse: 13 }` with commander's changelog entry, `nearest: 14` and `move: null`, and the summary reads `nothing to rewrite; 1 line uses an API a claimed major removed (see offMajor)`. |
| 2. A project on the claimed major gets no new rows | The postcss-cli clone above, on yargs 18, reports `offMajor: []`; held on `main` by `migrate-majors.test.ts`. |
| 3. Re-running the 2026-10-18 field trial: every `manual`-arm crash is named in the `mig` arm's report before anyone moves a specifier | The four trial projects (wait-port, madge, tsc-alias, node-qrcode) were re-run at their trial SHAs with the published CLI. Each `manual`-arm crash site in the spec's *Field re-run* table is named, and the one printed move is node-qrcode's `yargs -> burgee/yargs/v17`. |
