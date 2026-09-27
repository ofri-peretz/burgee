---
"burgee": minor
---

`schema` answers as an alias of `--schema` (D-151, GAPS B22). `mytool schema`, `mytool schema deploy` and `mytool schema deploy --field options.region` print exactly what the flag forms print, because `<tool> schema` is where clispec.dev and the agents that follow it look for a program's schema. A program's own meaning of the word wins: a declared `schema` command runs as written, and a root command that takes arguments receives `schema` as one. The root `--help` now lists `--schema  the program as data` among its global options. Loaded through the existing lazy `surfaces.js`; the core entry grows 14 bundled bytes.
