---
"burgee": minor
---

Command aliases, on every surface. A native command declares `aliases: ['s']`, and `prog s` runs it,
at any depth (`prog r a` is `prog remote add`). `--schema` lists the aliases on the command and never
as a command of their own, help prints them the way commander does (`serve|s`), the bash, zsh, fish
and PowerShell scripts and the Fig spec offer and follow them, `__complete`, `help <command>` and
`--schema <command>` read them, and `--mcp` names one tool per command by its canonical path.
`burgee/commander`'s `.alias()` / `.aliases()` and `burgee/yargs`' `['serve', 's']` or `aliases:` now
reach `--schema` the same way; both façades' own help and parsing are unchanged.
