# proofline

## 0.1.0

### Minor Changes

- [#1706](https://github.com/ofri-peretz/burgee/pull/1706) [`c924fd2`](https://github.com/ofri-peretz/burgee/commit/c924fd26b394b67e231486e6785a05fe73879379) Thanks [@ofri-peretz](https://github.com/ofri-peretz)! - proofline's first commands, as a burgee CLI. `stamp` runs the commands that prove a change and
  prints `Verified-by:` trailers (or, with `--pr`, the "How this was checked" block and its
  `Checked:` line). `gate` reads a commit message or PR body in `off`, `observe` or `enforce` mode,
  and after two blocks in one session lets the next run through, logged. `done <slug>` fails until
  every success criterion of the intent has a passing stamp on the branch. `intent new` and
  `intent check` port the intent lock's rules to any repository, and `intent check --evidence`
  re-runs each shipped intent's evidence commands.
