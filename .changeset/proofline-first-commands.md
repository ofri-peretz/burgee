---
"proofline": minor
---

proofline's first commands, as a burgee CLI. `stamp` runs the commands that prove a change and
prints `Verified-by:` trailers (or, with `--pr`, the "How this was checked" block and its
`Checked:` line). `gate` reads a commit message or PR body in `off`, `observe` or `enforce` mode,
and after two blocks in one session lets the next run through, logged. `done <slug>` fails until
every success criterion of the intent has a passing stamp on the branch. `intent new` and
`intent check` port the intent lock's rules to any repository, and `intent check --evidence`
re-runs each shipped intent's evidence commands.
