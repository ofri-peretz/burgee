---
title: Changelog
description: "Every release of replz, newest first, from its CHANGELOG.md — what changed and the pull request it came from."
---

## 1.2.0

### Minor Changes

- [#1873](https://github.com/ofri-peretz/burgee/pull/1873) [`d585875`](https://github.com/ofri-peretz/burgee/commit/d5858751881c8b667824ff7f235cc38db9fda98e) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `replz compare` runs a folder of inputs through the base ref and the head and fails on every output that changed, after `normalize` patterns remove noise, unless a person approved that exact change (by both outputs' digests) with a reason in `approved`.

- [#1873](https://github.com/ofri-peretz/burgee/pull/1873) [`d585875`](https://github.com/ofri-peretz/burgee/commit/d5858751881c8b667824ff7f235cc38db9fda98e) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `replz mine` drafts lint-rule candidates from review history: inline review comments and the tagged lines of summary reviews, read through `gh`, clustered by the pairs of content words two or more pull requests share. `--write` saves the draft for a person to accept or delete.

## 1.1.0

### Minor Changes

- [#1858](https://github.com/ofri-peretz/burgee/pull/1858) [`8d9c41e`](https://github.com/ofri-peretz/burgee/commit/8d9c41ef7b9ac72e00bdd77db81f8422103cefde) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - replz: `replz scorecard` scores how well a repository's checks catch bugs from its history alone (escape rate by named and SZZ-traced fixes, provedone receipts, and recall and false alarms from the last recorded run), each with a `next:` fix, and `--ratchet` holds it to bands. provedone: a `provedone/receipt` entry point, so a caller reads a receipt's verdict without loading the CLI.

### Patch Changes

- Updated dependencies [[`54403b9`](https://github.com/ofri-peretz/burgee/commit/54403b91c6a023db0c354c206e6d1c6c5bb40796), [`02f3ce0`](https://github.com/ofri-peretz/burgee/commit/02f3ce03b0075db5e0e99b991ad767dd2b396ccb), [`95ed437`](https://github.com/ofri-peretz/burgee/commit/95ed4377123d68e5de9c86b79f5abb32baa2b025), [`691c833`](https://github.com/ofri-peretz/burgee/commit/691c8331d6962b04f05988a58cc3c1c0426c82f7), [`8d9c41e`](https://github.com/ofri-peretz/burgee/commit/8d9c41ef7b9ac72e00bdd77db81f8422103cefde)]:
  - burgee@2.2.3
  - provedone@1.1.0

## 1.0.2

### Patch Changes

- [#1814](https://github.com/ofri-peretz/burgee/pull/1814) [`06089bd`](https://github.com/ofri-peretz/burgee/commit/06089bd8a1cdee49927e49a508e36ae7fa57ae78) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - replz's docs have a site of their own at https://replz.interlace.tools: getting started, guides, coming-from pages, recipes and the API reference. The package's `homepage` and README point there.
- Updated dependencies [[`4821145`](https://github.com/ofri-peretz/burgee/commit/482114557947f01bc8df543daf317dada2664c21)]:
  - burgee@2.2.2

## 1.0.1

### Patch Changes

- [#1810](https://github.com/ofri-peretz/burgee/pull/1810) [`102eecf`](https://github.com/ofri-peretz/burgee/commit/102eecf8a30ddab00865ab4e9338602a0e98e46f) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Fixes from the first runs of 1.0:

  - `replz run` sets `REPLZ_REPO`, the absolute path of the repository it started in, for the setup, the reviewer and every check, so a reviewer script kept in the repository is named `bash "$REPLZ_REPO/review.sh"`: a relative path was read in the case's worktree, at a head that may predate the script.
  - `--max-findings` grades the last stage's findings first, then each earlier stage's, so a low cap no longer spends its grader calls on raw findings before any final one.
  - `replz check` refuses a case file not named `<id>.yaml`, an answer still the draft's `TODO`, and a set without a bug or a control, which only this repository's own lock test caught before. `run` refuses the first two as well.
  - A runtime failure (exit 1) prints its `fix:` on its own line, and in `--json` as `error.fix`, without the command's usage block, which is now printed for a usage error (exit 2) only. A missing config or case folder names `--repo`.
  - `--repo`'s help names its default once.
  - The README says what the code does: `run` checks each case out at its head, and `propose` prints its drafts and writes no file.

- Updated dependencies [[`102eecf`](https://github.com/ofri-peretz/burgee/commit/102eecf8a30ddab00865ab4e9338602a0e98e46f)]:
  - truefit@1.0.1

## 1.0.0

### Major Changes

- [#1803](https://github.com/ofri-peretz/burgee/pull/1803) [`5cc7359`](https://github.com/ofri-peretz/burgee/commit/5cc7359f22173a8cc435d9301ce9cee9d92873b6) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - replz is 1.0. Its `.` entry, the `replz` bin with `check`, `run` and `propose`, their options, the `--json` report shape, the case-file and config formats, the history line and its exit codes are now a semver contract. Nothing changed in the code; the evidence is D-20261124-replz-1-0: 100% coverage, every spec row built (R5's rule mining moved to its own intent, a future minor), and a first full mutation run with no surviving mutant.

## 0.3.1

### Patch Changes

- Updated dependencies [[`78d014b`](https://github.com/ofri-peretz/burgee/commit/78d014badecbaa3cbf1bfa6aa94be01745359659)]:
  - truefit@1.0.0

## 0.3.0

### Minor Changes

- [#1796](https://github.com/ofri-peretz/burgee/pull/1796) [`be786b0`](https://github.com/ofri-peretz/burgee/commit/be786b0a4f8c3af04f52fc08b88cdd807c347a34) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - First npm release. `replz` grades a reviewer and a repository's checks against bugs that actually happened.

## 0.2.0

### Minor Changes

- [#1775](https://github.com/ofri-peretz/burgee/pull/1775) [`fa49d88`](https://github.com/ofri-peretz/burgee/commit/fa49d883f2b78421decc1e7de2b4a688a13f066e) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - Rename replay to replz, the npm name chosen for its first release (the name replay belongs to another package): the package, the bin and every command the CLI prints. replz reads `.sdlc/replz/` and sets `REPLZ_BASE`, `REPLZ_HEAD`, `REPLZ_PR` and `REPLZ_INPUT` for the reviewer.

## 0.1.3

### Patch Changes

- Updated dependencies [[`80d0383`](https://github.com/ofri-peretz/burgee/commit/80d03839c6d18db2d845dcc9ff51b279a48e207b)]:
  - truefit@0.2.1

## 0.1.2

### Patch Changes

- Updated dependencies [[`dc457f8`](https://github.com/ofri-peretz/burgee/commit/dc457f890987c9db31dcd952f60c4e0d762ce97b)]:
  - loadline@0.2.0

## 0.1.1

### Patch Changes

- Updated dependencies [[`d218e73`](https://github.com/ofri-peretz/burgee/commit/d218e734a61c1c3f95f245f1fb784360db3861de)]:
  - loadline@0.1.0

## 0.1.0

### Minor Changes

- [#1714](https://github.com/ofri-peretz/burgee/pull/1714) [`d7a3aab`](https://github.com/ofri-peretz/burgee/commit/d7a3aabbb2539f3f3317a75a8a0d8aa998a095df) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - replay, which grades the reviewer and the checks against bugs that actually happened: `run` replays each case (a bug PR with a one-sentence answer key, or a size-matched clean control) in a worktree at its head through the configured reviewer and checks, grades each finding against the answer key with at most `--max-findings` grader calls per case, and reports recall per stage, false alarms on controls, and how often every check and checklist item fired and was right, naming the ones that never fired. `propose` drafts cases from reverts and fixes on main; `check` validates the cases and config.

### Patch Changes

- Updated dependencies [[`14c0153`](https://github.com/ofri-peretz/burgee/commit/14c01531d78b79fa150d830cd281d88ab94e1977)]:
  - burgee@2.1.5
