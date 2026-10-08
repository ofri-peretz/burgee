---
"burgee": patch
---

The `--json` envelope's `ok` now agrees with the exit code. A command whose result names a non-zero `exitCode` printed `"ok":true` and then exited non-zero, so `burgee check <file> --json` said `ok` about a plugin it refused and `burgee migrate --json` said `ok` about a run with refusals. Both now print `"ok":false`, with the report still in `data`: `data.refused` (code, message, fix) for `check`, `data.refused[]` for `migrate`. A result with no `exitCode`, or `exitCode: 0`, prints `"ok":true` as before.
