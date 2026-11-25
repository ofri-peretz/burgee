---
title: Changelog
description: "Every release of provedone, newest first, from its CHANGELOG.md — what changed and the pull request it came from."
---

## 1.0.0

### Major Changes

- [#1798](https://github.com/ofri-peretz/burgee/pull/1798) [`78d014b`](https://github.com/ofri-peretz/burgee/commit/78d014badecbaa3cbf1bfa6aa94be01745359659) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - provedone is 1.0. Its `.` entry, the `provedone` bin and its commands (`stamp`, `gate`, `done`, `intent new`, `intent check`), the `Verified-by:` and `Checked:` trailer formats, the `off`/`observe`/`enforce` modes and its exit codes are now a semver contract: a trailer a 1.x wrote is read by every later 1.x. Nothing changed in the code; the evidence is D-20261124-verification-family-1-0: 100% coverage, every spec row built, and a first full mutation run with no surviving mutant.

## 0.3.1

### Patch Changes

- [#1792](https://github.com/ofri-peretz/burgee/pull/1792) [`4e2c9ac`](https://github.com/ofri-peretz/burgee/commit/4e2c9acbfa5beb545062c94a540f28adfed0109a) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `provedone stamp` folds each trailer to 100 columns, commitlint's default `footer-max-line-length`, with git continuation lines, so a long command or gap no longer fails the commit-msg hook.

## 0.3.0

### Minor Changes

- [#1784](https://github.com/ofri-peretz/burgee/pull/1784) [`86cce06`](https://github.com/ofri-peretz/burgee/commit/86cce067fb8c0d46a0df88c7df6a2d1f0489bb60) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - provedone is published: `npm install provedone`. The package carries its registry metadata, a README with a quick start the locks run, its mark, and a declared incumbent (@commitlint/cli, by surface), and `intent check` has an eval case, `provedone-intent-check`.

## 0.2.0

### Minor Changes

- [#1775](https://github.com/ofri-peretz/burgee/pull/1775) [`fa49d88`](https://github.com/ofri-peretz/burgee/commit/fa49d883f2b78421decc1e7de2b4a688a13f066e) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Rename proofline to provedone, the npm name chosen for its first release (the name proofline belongs to another package): the package, the bin and every command the CLI prints. provedone moves a clone's `.git/proofline/` log to `.git/provedone/` on first use, so the observe history carries over; `PROOFLINE_MODE` and `PROOFLINE_SESSION` become `PROVEDONE_MODE` and `PROVEDONE_SESSION`.

## 0.1.0

### Minor Changes

- [#1706](https://github.com/ofri-peretz/burgee/pull/1706) [`c924fd2`](https://github.com/ofri-peretz/burgee/commit/c924fd26b394b67e231486e6785a05fe73879379) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - provedone's first commands, as a burgee CLI. `stamp` runs the commands that prove a change and
  prints `Verified-by:` trailers (or, with `--pr`, the "How this was checked" block and its
  `Checked:` line). `gate` reads a commit message or PR body in `off`, `observe` or `enforce` mode,
  and after two blocks in one session lets the next run through, logged. `done <slug>` fails until
  every success criterion of the intent has a passing stamp on the branch. `intent new` and
  `intent check` port the intent lock's rules to any repository, and `intent check --evidence`
  re-runs each shipped intent's evidence commands.
