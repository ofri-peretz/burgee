# hookset

## 0.2.1

### Patch Changes

- [#1777](https://github.com/ofri-peretz/burgee/pull/1777) [`1c6440d`](https://github.com/ofri-peretz/burgee/commit/1c6440d69333af060a46826f71e74625ff17ca05) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - guard-bash gives a command a repo lists under `ask` in `.claude/hookset.json` its own reason (rule id `repo-ask`) instead of the publish message, so a listed `-- --force` sync is not described as a release.

## 0.2.0

### Minor Changes

- [#1774](https://github.com/ofri-peretz/burgee/pull/1774) [`70f4252`](https://github.com/ofri-peretz/burgee/commit/70f425240bf3ee3e1030f50e66acd12e39b35b87) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - guard-bash denies a foreground `git commit` or `git push` under a 5-minute timeout: their hooks are the repo's gate and outlive Claude Code's default 2 minutes. The denial names the fix (`timeout: 600000` or `run_in_background: true`), so a repo's CLAUDE.md no longer has to say "not a hang".
