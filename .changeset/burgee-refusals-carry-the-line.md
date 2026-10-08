---
"burgee": patch
---

Refusals in a native burgee program now name the command to run, so an agent no longer has to spend a turn working it out.

- **An unknown command lists the commands that run, with what each takes.** If they fit in the eight rows, a group's refusal lists `config get <key>` rather than `config`. A larger tree still lists one level, now also with arguments.
- **A word that exactly names a deeper command is corrected to that command.** `get user.name` gets `fix: demo config get user.name`. Before, the fix pointed at `greet`, two edits away. When two deeper commands share the word, nothing is guessed.
- **The fix asks for JSON in burgee's spelling.** A JSON request typed before the command (`--json config get k`, `--format json …`), or spelled as `--format json` or `--output=json`, is moved into the fix as `--json`, before any `--`. An unknown `--format json` or `--output json` on a command now suggests `--json`. `--json` is also a candidate for near misses such as `--jsno`.
- **Help lists each command with its arguments**, the way commander does: `get <key>`, not `get`.
- **A missing required argument no longer adds "run --help to see what it takes".** The refusal already prints the command's usage line.

The façades are unchanged. The core entry is 66 bytes lighter, and `./help` is 54 bytes heavier, inside its budget.
