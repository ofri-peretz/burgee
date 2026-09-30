---
"burgee": patch
---

A flag's provenance now names the flag as it was typed: `--dry-run`, `-n` or `--no-color` in `meta.provenance` and in `--explain`, instead of the camelCase key (`--dryRun`, which burgee itself refuses). A flag that was not typed is listed in kebab-case.
