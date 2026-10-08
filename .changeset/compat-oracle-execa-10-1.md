---
"compat-oracle": patch
---

execa re-vendored at 10.1.0, whose suite moved from ava to `node:test`: the row runs under `node:test` one file at a time, and a host's `timeoutMs` now reaches node's `--test-timeout`. Control 1179 / 1179; `bellpull` 0 / 1179, still a ceiling. dotenv re-vendored at 18.0.6: control 181 / 181.
