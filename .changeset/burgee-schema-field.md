---
'burgee': minor
---

`--schema <command> --field <path>` returns a single field of a command's schema, such as `--field options.region`, so an agent can read the part it needs without loading the whole document. An unknown path step is refused with the valid fields at that level listed.
