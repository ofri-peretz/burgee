---
"seniority": patch
---

At an equal rank the plugin registered later now wins, as the docs and `register()` always said. `sources()` returned tied plugins oldest first and `resolve` takes the first candidate with a value, so the earlier registration won the tie.
