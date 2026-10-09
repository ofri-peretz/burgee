---
"burgee": minor
---

A native burgee program now reads a request for JSON wherever and however it is typed, and every fix it prints runs.

- **`--format json` is `--json`.** `--format json`, `--format=json`, `--output json` and `--output=json` now run the command with `--json`. They used to be refused with `fix: … --json`. A command that declares an option of that name keeps it, and a command that declares one near it (`--formats`) still gets the refusal, because then which was meant is a guess.
- **`--json` before the command is read.** `demo --json config get user.name` and `demo --format json config get user.name` now run `config get user.name --json`. They used to be refused with `--json goes after the command`.
- **A fix after a request for JSON starts where the request left off.** `demo --format json config user.name` printed `fix: demo config user.name --json`, which is refused in turn. It now prints `fix: demo config get user.name --json`.
- **A dashed word where a command goes is matched by its name.** `demo --get user.name` printed `did you mean --eet?` and a fix naming a command that does not exist. It now prints `did you mean config get?` and `fix: demo config get user.name`.

Only the request for JSON is ever read this way. A misspelt or misplaced command word is still a usage error with a `fix`, and nothing is run for you. The façades are unchanged: commander 1360/1360, yargs 816/816. The core entry is 58 bytes heavier and inside its ceiling.
