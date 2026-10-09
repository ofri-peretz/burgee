---
"burgee": patch
---

Help and refusals in a native burgee program now put the whole line to run on the first screen.

- **`--help` lists the commands that run by their full path.** When every command that runs fits in eight rows, the root help lists `config get <key>  Print one configuration value` where it listed `config  Read configuration`. It uses the same rule as the unknown-command listing. Hidden commands stay hidden, and a larger program keeps its group rows. `renderHelp` takes the list as a new optional `commands` option, and without it renders as before.
- **A refused word that is really an argument gets a fix.** `demo config user.name --format json` now prints `fix: demo config get user.name --json`. This happens when one command below the group takes arguments, or when the words fit the arguments of exactly one of them: `config user.name` fits `get <key>` and not `set <key> <value>`. When two fit, nothing is guessed. A flag is never read as an argument.
- **An unknown-option fix is the whole corrected command line.** `demo config get user.name --format json` now prints `fix: demo config get user.name --json`, not `fix: --json`. A near miss keeps its value (`--nmae=ada` becomes `--name=ada`), and words a shell needs quoted are quoted.

The façades are unchanged: commander 1360/1360, yargs 816/816. The core entry is 19 bytes heavier, and `./help` is 105 bytes heavier. Both are inside their budgets.
