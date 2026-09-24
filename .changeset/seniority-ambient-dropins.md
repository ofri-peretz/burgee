---
'seniority': minor
---

The `seniority/dotenv` and `seniority/rc` drop-ins now read the process by default, like the packages they replace. `config()` with no arguments populates `process.env` from `./.env`; `rc(name)` reads the process environment. `config()` also accepts a `URL` or `~/` path, calls `fs`/`os` in a way test stubs can intercept, and returns `parsed` alongside any `error`, matching dotenv 17. Graded by each incumbent's own test suite: dotenv 80 → 106 of 141, rc 0 → 1 of 1. seniority's resolver still never reads the process itself.
