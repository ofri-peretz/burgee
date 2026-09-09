---
'burgee': patch
---

Completions offer `--no-<name>` for every declared boolean, in all four shells, and fish emits the CLI form rather than the declaration name. fish alone built its own spelling instead of going through `flags()`, so it had been completing `-l dryRun` where the flag is `--dry-run` — a flag the parser refuses — for every camelCase option. The reserved surfaces are excluded: `--no-json` and `--no-help` are not accepted by the parser and are not offered.
