---
"seniority": patch
---

`seniority/dotenv/cli` on Windows: `dotenv run` now refuses an argument with a line break or NUL in it, and an environment with a variable name ending in `^`, before anything starts. It reports `dotenv: …` and exits 1, because cmd.exe cannot carry those. It also escapes `:` for cmd, so `%name:…%` can no longer expand a variable into the command line. Each closes a way a crafted argument could reach cmd.exe live. Arguments that are not refused reach the program exactly as before.
