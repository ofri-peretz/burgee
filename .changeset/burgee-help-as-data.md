---
'burgee': minor
---

`--help --json` prints help as data.

It printed the same prose as `--help`. A caller who asked for a machine-readable answer got
one they had to parse — the exact failure the whole `--json` surface exists to avoid, on the
flag people type first. burgee's design recorded it as **F2, `Not built`**: *"no JSON help
surface; `--help --json` prints the same prose as `--help`."*

The document is `commandSchemaOf` scoped to the node you asked about — the same shape
`--schema` publishes, so a reader learns it once — plus `schemaVersion`, and for a group the
names of its children. A group's help is a menu; a reader who wants a child's detail asks for
that child, which is the same walk they would do on the text.

Plain `--help` is unchanged.
