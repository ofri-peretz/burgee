# replz

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
