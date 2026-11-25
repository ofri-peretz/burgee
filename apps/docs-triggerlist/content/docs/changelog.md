---
title: Changelog
description: "Every release of triggerlist, newest first, from its CHANGELOG.md — what changed and the pull request it came from."
---

## 1.0.1

### Patch Changes

- [#1814](https://github.com/ofri-peretz/burgee/pull/1814) [`06089bd`](https://github.com/ofri-peretz/burgee/commit/06089bd8a1cdee49927e49a508e36ae7fa57ae78) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - triggerlist's docs have a site of their own at https://triggerlist.interlace.tools: guides for the checklist file and each command, reading from the base branch, the reviewer's brief, recipes for GitHub Actions, a pre-push hook, monorepos and agents, and a migration guide from danger. The package's `homepage` and its README's Docs line point there.

- [#1813](https://github.com/ofri-peretz/burgee/pull/1813) [`4821145`](https://github.com/ofri-peretz/burgee/commit/482114557947f01bc8df543daf317dada2664c21) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `match` on a base ref with no checklist file yet matches nothing and says so (`bootstrap: true`), as `brief` and `protect` do; a ref the checkout lacks still fails with its fix, and a base checklist that does not parse still fails. `seed` drafts each lock test's `check` with a command that fits the repository it reads: `npx vitest run --config <file>` for a root vitest config that names the lock folder, `npx vitest run` where vitest is otherwise in use, and `run <file>` where it is not. The README's exit-code table says `protect` exits 1 only with `--enforce`.

- [#1818](https://github.com/ofri-peretz/burgee/pull/1818) [`5e75589`](https://github.com/ofri-peretz/burgee/commit/5e7558982812c583768b782ba5adcc1983eba43c) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `protect` and `brief` now fail on a base checklist that is there and does not parse, as `match`
  already did. Only a missing checklist file is let through as a bootstrap, so a broken base
  checklist can no longer turn `protect --enforce` into a pass.
- Updated dependencies [[`4821145`](https://github.com/ofri-peretz/burgee/commit/482114557947f01bc8df543daf317dada2664c21)]:
  - burgee@2.2.2

## 1.0.0

### Major Changes

- [#1808](https://github.com/ofri-peretz/burgee/pull/1808) [`068c76b`](https://github.com/ofri-peretz/burgee/commit/068c76b1ecdc5b667b36c40bed25bb5daa54026d) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - triggerlist is 1.0. Its `.` entry, the `triggerlist` bin with `match`, `brief`, `protect`, `compile` and `seed`, their options, `--json` shapes and exit codes, the checklist file format and the compiled `REVIEW.md` layout are now a semver contract. Nothing changed in the code; the evidence is D-20261124-hookset-triggerlist-1-0: 100% coverage, every spec row built, and a first full mutation run with no surviving mutant.

### Patch Changes

- [#1805](https://github.com/ofri-peretz/burgee/pull/1805) [`0ad24f0`](https://github.com/ofri-peretz/burgee/commit/0ad24f0e554915958ce8e66243a67cf75cd67832) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `triggerlist brief` briefs the reviewer when the base branch has no REVIEW.md or checklist yet, instead of failing the review of the pull request that adds them.

- [#1805](https://github.com/ofri-peretz/burgee/pull/1805) [`0ad24f0`](https://github.com/ofri-peretz/burgee/commit/0ad24f0e554915958ce8e66243a67cf75cd67832) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `triggerlist brief --replies <file>` quotes the pull request author's comments and review-thread replies posted after the previous review round (bots left out, at most 10, each trimmed to 1200 characters), and tells the reviewer that a finding the author answered is not repeated unless the new diff changes the facts: it says in one line that it was answered and why that answer holds or does not.

- [#1805](https://github.com/ofri-peretz/burgee/pull/1805) [`0ad24f0`](https://github.com/ofri-peretz/burgee/commit/0ad24f0e554915958ce8e66243a67cf75cd67832) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `triggerlist protect` passes, checking nothing, when the base branch has no checklist yet, so the pull request that adds a repository's first `.sdlc/checklist.yaml` no longer fails its own pre-push.

## 0.3.1

### Patch Changes

- Updated dependencies [[`78d014b`](https://github.com/ofri-peretz/burgee/commit/78d014badecbaa3cbf1bfa6aa94be01745359659)]:
  - truefit@1.0.0

## 0.3.0

### Minor Changes

- [#1796](https://github.com/ofri-peretz/burgee/pull/1796) [`be786b0`](https://github.com/ofri-peretz/burgee/commit/be786b0a4f8c3af04f52fc08b88cdd807c347a34) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - First npm releases. `hookset` ships the verification stations as lefthook presets and a Claude Code hook pack; `triggerlist` hands a reviewer only the checklist items a diff fires.

## 0.2.0

### Minor Changes

- [#1782](https://github.com/ofri-peretz/burgee/pull/1782) [`cbfa42f`](https://github.com/ofri-peretz/burgee/commit/cbfa42f48495a1d3b1810119155f51bcd3b721be) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - `triggerlist brief <base> --head <sha>` prints a reviewer's brief for one round: REVIEW.md as the base branch has it, the checklist items the diff fires, the reviewer's findings from the previous round (`--comments`, the PR's comments as `gh api` lists them) and a marker line naming the commit it reviewed. The composite action `.github/actions/triggerlist-review` hands it to Claude in CI and flags a review whose head moved while it ran.

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

- [#1705](https://github.com/ofri-peretz/burgee/pull/1705) [`d6b7613`](https://github.com/ofri-peretz/burgee/commit/d6b7613609eafcc64ffed4586ad1940be590287c) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - triggerlist, a review checklist the diff selects: `match` prints only the items whose triggers fire on `<base>...HEAD`, read from the base branch so a change cannot edit its own checks; `compile` writes REVIEW.md under a byte budget and names the least-fired rules to drop when over; `seed` drafts items from lock-test headers and decision files; `protect` flags a change to a gate file made together with the code it judges.
