---
"compat-oracle": patch
---

A vendored suite's dependencies now install as of the release the suite was vendored at, not as of the day of the run. Each `.source.json` records `depsBefore`, the newest release the suite pins plus an hour, and the install passes it to npm as `--before`. On 2026-10-19 inquirer published new siblings under `@inquirer/prompts` 8.7.3's `^` ranges, and the control read 212 / 213 with nothing changed here. It reads 213 / 213 again. A tree installed before this is re-resolved once.
