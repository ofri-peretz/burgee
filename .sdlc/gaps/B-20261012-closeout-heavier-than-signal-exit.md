---
id: B-20261012-closeout-heavier-than-signal-exit
section: B
status: open
source: foundation-claims-watched R6
recommendation: 'Keep the B4 row a ratchet at its measurement (`BUNDLED_CEILING` 3,750 B, `RATIO_CEILING` 1.31 in `benchmarks/axes/weight.ts`) so it cannot grow, and lower both, toward U5''s 1, as closeout''s signal-exit path sheds bytes. Whether the drop-in is held to U5 on its own is closeout''s decision to record'
---

`closeout/signal-exit` bundles to **3,634 B** against `signal-exit@4.1.0`'s **2,856 B**, a ratio
of **1.272** (`npm run bench -- --axis weight`, 2026-10-12, at `582bc15` plus this change:
`esbuild --bundle --minify --format=esm --platform=node --splitting` over a fixture importing
`onExit` on each side, since signal-exit has no default export). U5 ("a drop-in weighs no more
than the incumbent it replaces") does not hold for it, and `lighter-than-signal-exit` reads
*not met* on the claim table.

closeout's README did not state this comparison before; this row is the first time it is
measured, and it is gated: the ceiling is the measurement plus the 80 B CI margin, rounded up,
so it cannot grow unremarked. Where the 778 B come from is *unmeasured* here.
