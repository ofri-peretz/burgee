---
'hookset': minor
---

guard-bash denies Edit/Write on a generated file listed under `generated` in `.claude/hookset.json` (glob to the command that writes it) and names that command, so a repo drops its "regenerate, don't hand-edit" prose.
