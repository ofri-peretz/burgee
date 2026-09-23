---
"burgee": patch
---

Shell completions offer only flags the parser accepts. Every declared boolean was completed with a `--no-<name>` twin, which is right for burgee's own parser and wrong under `burgee/commander`, where commander negates only what the program declared — so `--no-skip-blank`, `--color` (for a lone `--no-color`) and `--no-version` were each a TAB away and each `unknown option`. Completions now read `OptionSpec.negatable`, which the commander façade sets from the program's own declarations.
