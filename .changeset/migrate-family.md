---
"burgee": minor
---

`burgee migrate` now migrates the whole family, not just commander and yargs. Every drop-in the compatibility oracle grades level with its incumbent is rewritten in the same run: chalk → `roundel/chalk`, ora → `flagstaff/ora`, string-width → `linegauge`, cross-spawn → `bellpull/cross-spawn`, signal-exit → `closeout/signal-exit` and eleven more. Drop-ins not yet level (dotenv, cosmiconfig, clack, meow, …) are reported under `partial` with their grade and left alone. The report names the family packages to add and prints `next`, the install-and-uninstall command for the package manager your lockfile names.
