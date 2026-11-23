# replay

## 0.1.0

### Minor Changes

- [#1714](https://github.com/ofri-peretz/burgee/pull/1714) [`d7a3aab`](https://github.com/ofri-peretz/burgee/commit/d7a3aabbb2539f3f3317a75a8a0d8aa998a095df) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - replay, which grades the reviewer and the checks against bugs that actually happened: `run` replays each case (a bug PR with a one-sentence answer key, or a size-matched clean control) in a worktree at its head through the configured reviewer and checks, grades each finding against the answer key with at most `--max-findings` grader calls per case, and reports recall per stage, false alarms on controls, and how often every check and checklist item fired and was right, naming the ones that never fired. `propose` drafts cases from reverts and fixes on main; `check` validates the cases and config.

### Patch Changes

- Updated dependencies [[`14c0153`](https://github.com/ofri-peretz/burgee/commit/14c01531d78b79fa150d830cd281d88ab94e1977)]:
  - burgee@2.1.5
