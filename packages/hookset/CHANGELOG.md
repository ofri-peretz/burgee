# hookset

## 0.3.0

### Minor Changes

- [#1796](https://github.com/ofri-peretz/burgee/pull/1796) [`be786b0`](https://github.com/ofri-peretz/burgee/commit/be786b0a4f8c3af04f52fc08b88cdd807c347a34) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - First npm releases. `hookset` ships the verification stations as lefthook presets and a Claude Code hook pack; `triggerlist` hands a reviewer only the checklist items a diff fires.

### Patch Changes

- [#1794](https://github.com/ofri-peretz/burgee/pull/1794) [`3e107e3`](https://github.com/ofri-peretz/burgee/commit/3e107e351f79f2a0a721811fb6a540b5dcfdbd6a) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - guard-bash asks before `pnpm -F pkg publish`: a single-dash option can take the next word as its value, the same as `--filter pkg`, so the publish after it is found.

## 0.2.2

### Patch Changes

- [#1790](https://github.com/ofri-peretz/burgee/pull/1790) [`40903e7`](https://github.com/ofri-peretz/burgee/commit/40903e74a35b0c111d5a672416249034f5cabd46) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - guard-bash: `git push --dry-run` still needs the long timeout (it runs pre-push; only `git commit --dry-run` skips hooks), `npm`/`pnpm` options before `publish` still ask a person, and dot segments in an edited path cannot step around a frozen glob. stop-after-3: an interrupted test run keeps the failure count instead of resetting it.

## 0.2.1

### Patch Changes

- [#1777](https://github.com/ofri-peretz/burgee/pull/1777) [`1c6440d`](https://github.com/ofri-peretz/burgee/commit/1c6440d69333af060a46826f71e74625ff17ca05) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - guard-bash gives a command a repo lists under `ask` in `.claude/hookset.json` its own reason (rule id `repo-ask`) instead of the publish message, so a listed `-- --force` sync is not described as a release.

## 0.2.0

### Minor Changes

- [#1774](https://github.com/ofri-peretz/burgee/pull/1774) [`70f4252`](https://github.com/ofri-peretz/burgee/commit/70f425240bf3ee3e1030f50e66acd12e39b35b87) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - guard-bash denies a foreground `git commit` or `git push` under a 5-minute timeout: their hooks are the repo's gate and outlive Claude Code's default 2 minutes. The denial names the fix (`timeout: 600000` or `run_in_background: true`), so a repo's CLAUDE.md no longer has to say "not a hang".
