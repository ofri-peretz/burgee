---
"seniority": minor
---

Provenance now gives the line for a value set in the `package.json` field. The new `packageLayer(path, name)` in `seniority/config` (and the root) reads the field named after your program as the layer below the config file, and records the line each of its keys is set on. `explain` then prints `package.json field in /app/package.json:6`, not just the file. Pass the parsed manifest as a third argument if you already have it, and the file is read again only for the lines.

`lineOf` now reads the top level of the JSON only. It used to return the first `"key":` anywhere in the file, so a nested key with the same name, written above the top-level one, was cited at the wrong line. A key set twice is cited at the last one, the one `JSON.parse` keeps.

burgee: `--explain` and `meta.provenance` now give the line for a value set in the `package.json` field (`package.json:5`), as they already did for a config file.
