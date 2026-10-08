---
"bellpull": patch
---

A resolver's `when` refuses any key other than `platform` and `envAny`, at `register()` and in `bellpull check`, with `E_PLUGIN_SCHEMA` naming the key and the keys allowed. A misspelled condition such as `when: { env: [...] }` was ignored, so the resolver applied on every machine and `check` reported `ok`.
