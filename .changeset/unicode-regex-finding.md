---
"linegauge": patch
---

Records, in `width.ts`, that a probe attributing 10.61 ms to one Unicode regex was measuring
its own ordering: the first `\p{…}` regex in a cold process pays a one-time initialisation
that whichever ran first would have paid.
