---
id: D-20261020-oracle-suite-deps-floated
subject: 'compat-oracle: what does a vendored suite''s dependency tree resolve as of?'
taken: 'As of the release it was vendored at — npm''s `--before` the newest pinned release plus an hour, recorded in `.source.json` as `depsBefore`'
date: '2026-10-20'
superseded_by: —
---

**The incident.** On 2026-10-19 at 21:42 UTC inquirer published its next batch: `@inquirer/prompts`
8.7.4, `core` 12.0.5, `select` 5.2.7, `checkbox` 5.2.7, `input` 5.1.8, `search` 4.3.5 and
`editor` 5.3.5. `main` had passed the required "Ratchet · each host's suite against burgee" at
19:14 UTC. From then on, every run of it failed on `main` (run 39341168094) and on every PR, with
`✖ inquirer-prompts: 1 failing against its own package (0 allowed)`. The real
`@inquirer/prompts` control read 212 / 213. Nothing had changed in this repository.

**The cause** was in the instrument. `installSuiteDeps` ran
`npm install --no-package-lock --prefix vendor/<host>`. `vendor/inquirer-prompts/package.json`
pins `@inquirer/prompts` 8.7.3, and 8.7.3 reaches its siblings by `^` range. So each clean
checkout installed the siblings published that evening under the old pin, and one 8.7.3 case no
longer held. A pin holds only the package it names, and every host with suite dependencies had
the same exposure: 31 of them.

Reproduced locally, with `main`'s install: `@inquirer/select` 5.2.7, `checkbox` 5.2.7, control
212 / 213. With this change: 5.2.6 and 5.2.6, control **213 / 213**.

**Decided.**

- **The tree resolves as of the release.** `vendor()` records `depsBefore` in `.source.json`: the
  newest release among the host's exact `suiteDeps` pins (the incumbent's own release where it pins
  none), plus one hour. The hour covers a monorepo's batch: @inquirer/prompts 8.7.3's siblings were
  published within 34 seconds of it. The install passes `--before=<depsBefore>`. The 31 existing
  records were backfilled from the registry's `time` once, in this change. A normal run asks the
  registry nothing.
- **A tree resolved as of anything else is installed again.** After an install, the vendored
  `node_modules` carries `.oracle-deps-before` with the cutoff it was resolved as of. A tree with no
  marker, or another date, is removed and installed again, because npm keeps any installed copy
  that still satisfies its range. Every tree installed before this one has no marker, so each is
  re-resolved once.
- **Two exceptions, both unchanged in behaviour.** A suite declaring only ranges (`vendorDeps`,
  supplied by the workspace hoist) has no tree of its own to re-date. Neither has a host that
  commits its `node_modules` (`wrap-ansi`): that tree is fixed already, and re-dating it would
  rewrite tracked files. Where either does install something missing, it installs it as of the
  cutoff.
- **No record, no install.** A suite with dependencies and no `depsBefore` is refused with an error
  that says to re-vendor, rather than installed as of today.

**Held by:**

- `vendored-suite.test.ts` › `a vendored suite with dependencies records when they resolve as of`
  (31 cases, every one red before the backfill);
- `grade.test.ts` › `installing what a vendored suite declares`, whose install argv carries
  `--before=<depsBefore>`; 6 of its 8 cases fail against the old install;
- `vendor.test.ts` › `depsCutoff`, and `vendor-run.test.ts` for the record written at vendor time.

**Rejected.**

- **Pin every transitive package in `suiteDeps`.** It would be dozens of pins per host, kept by
  hand, and the next sibling nobody listed floats again.
- **Commit a lockfile per vendored suite.** That is a second lockfile beside the workspace's, in
  31 directories, re-generated on every re-vendor.
- **The vendoring date as the cutoff.** It is a day, not a moment: inquirer's suite was vendored
  on 2026-10-19, the same day the new batch was published.
- **Allow one failing control case.** The control proves the gate. An allowance absorbs the next
  float too, and hides a real one.
