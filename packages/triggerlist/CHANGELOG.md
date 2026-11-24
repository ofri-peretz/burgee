# triggerlist

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
