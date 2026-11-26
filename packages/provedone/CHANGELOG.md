# provedone

## 1.1.0

### Minor Changes

- [#1869](https://github.com/ofri-peretz/burgee/pull/1869) [`95ed437`](https://github.com/ofri-peretz/burgee/commit/95ed4377123d68e5de9c86b79f5abb32baa2b025) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `intent check` and `intent new` read a repository's own design file name: `design.md` beside
  `intent.md` counts as the spec, and `intent new` copies whichever of `spec.md` or `design.md` the
  `_template/` holds. Each `fix:` now names that file and the `--dir` given, not always
  `.sdlc/intents/<slug>/spec.md`. On eslint's `docs/intents` this turns 32 false "has no spec.md"
  findings into 0.

- [#1855](https://github.com/ofri-peretz/burgee/pull/1855) [`691c833`](https://github.com/ofri-peretz/burgee/commit/691c8331d6962b04f05988a58cc3c1c0426c82f7) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `intent check` reports `filter-count`: a shipped intent's evidence row whose command filters tests by name (`-t`, `--testNamePattern`, `--test-name-pattern`, `--grep`) must record an `N passed` count, because a filter that matches nothing exits 0 and the re-run would stay green after the test is renamed or deleted.

- [#1858](https://github.com/ofri-peretz/burgee/pull/1858) [`8d9c41e`](https://github.com/ofri-peretz/burgee/commit/8d9c41ef7b9ac72e00bdd77db81f8422103cefde) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - replz: `replz scorecard` scores how well a repository's checks catch bugs from its history alone (escape rate by named and SZZ-traced fixes, provedone receipts, and recall and false alarms from the last recorded run), each with a `next:` fix, and `--ratchet` holds it to bands. provedone: a `provedone/receipt` entry point, so a caller reads a receipt's verdict without loading the CLI.

### Patch Changes

- Updated dependencies [[`54403b9`](https://github.com/ofri-peretz/burgee/commit/54403b91c6a023db0c354c206e6d1c6c5bb40796), [`02f3ce0`](https://github.com/ofri-peretz/burgee/commit/02f3ce03b0075db5e0e99b991ad767dd2b396ccb)]:
  - burgee@2.2.3

## 1.0.1

### Patch Changes

- [#1814](https://github.com/ofri-peretz/burgee/pull/1814) [`06089bd`](https://github.com/ofri-peretz/burgee/commit/06089bd8a1cdee49927e49a508e36ae7fa57ae78) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - provedone's docs have a site of their own, provedone.interlace.tools, with guides for `stamp`, `gate`, `done` and `intent`, the receipt format, the modes and the escape, a commitlint migration page and recipes for the commit-msg hook, CI and agents. The package's `homepage` and its README's Docs line point there.
- Updated dependencies [[`4821145`](https://github.com/ofri-peretz/burgee/commit/482114557947f01bc8df543daf317dada2664c21)]:
  - burgee@2.2.2

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
