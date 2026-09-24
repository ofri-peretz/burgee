---
'burgee': minor
---

`--json=<a,b>` selects the fields of a command's result, and `--json=` lists the fields a command declares (`fields: [...]` on `defineCommand`) without running it. An unknown field is refused with the valid set in the hint. Only the `=` form takes fields, so `cmd --json name` keeps `name` a positional. Declared fields appear in `--schema`.
