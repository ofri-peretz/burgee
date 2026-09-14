---
'seniority': minor
---

Host `sources`, the plugin key, at `seniority/plugin` — a plugin adds a resolution source (a vault, a CI variable set, a remote config) and `--explain` names it as the provenance of the value it won.

`Source` is now an open union, so this is additive rather than a type break, and the one code change it costs is `describe()`'s `default` branch: an unknown source renders itself from the `source` and `location` it declared, which is how a plugin explains itself without seniority knowing its name.

`ORDER` is exported and is the single declaration the union and the new `RANK` are both generated from — the design's array and the shipped union had disagreed (`project`/`home`/`pkg` against `config`/`package`), and a plugin must not register against two spellings. The shipped five win, because `provenance.source` is a value users already read and because `project` versus `home` was one kind with two locations, which `location` already names precisely.

A plugin's `rank` slots its source *between* two built-ins and is refused outside `(flag, default)`: it can never beat the flag the user typed, nor sink below the declared default. The order stays the fixed thing it claims to be.
