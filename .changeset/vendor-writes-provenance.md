---
'compat-oracle': patch
---

`vendor()` writes `PROVENANCE` beside `.source.json`.

`scripts/vendor-suite.ts` was the only writer of it, and `vendor()` — which `compat --vendor`
calls — replaces the host directory wholesale. So re-vendoring a host through the oracle
deleted a file `provenance.test.ts` requires, and the lock then went red on a host nobody had
edited by hand, naming a file the oracle had removed itself. Both files come from the same
record; writing one without the other was only ever a division of labour between two callers.
