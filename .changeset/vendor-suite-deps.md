---
"compat-oracle": patch
---

`has-ansi` is a declared `suiteDeps` entry rather than a committed
`vendor/wrap-ansi/node_modules/` directory, so a re-vendor run cannot delete it and take the
row from 80 / 80 to 0 / 80 — which is what happened on 2026-09-21, against a `.gitignore`
that had named the hazard in as many words.
