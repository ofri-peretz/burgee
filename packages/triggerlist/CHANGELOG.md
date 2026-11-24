# triggerlist

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
