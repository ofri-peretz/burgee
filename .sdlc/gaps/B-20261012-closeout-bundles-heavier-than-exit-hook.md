---
id: B-20261012-closeout-bundles-heavier-than-exit-hook
section: B
status: closed
source: foundation-claims-watched R6
recommendation: 'Keep the B4 row a ratchet at its measurement (`BUNDLED_CEILING` 4,900 B, `RATIO_CEILING` 2.98 in `benchmarks/axes/weight.ts`) so it cannot grow, and lower both, toward U5''s 1, as closeout''s exit-hook path sheds bytes. Whether the drop-in is held to U5 on its own or carries the shared runner as product is closeout''s decision to record'
---

`closeout/exit-hook` bundles to **4,819 B** against `exit-hook@5.1.0`'s **1,645 B**, a ratio of
**2.929** (`npm run bench -- --axis weight`, 2026-10-12, at `582bc15` plus this change:
`esbuild --bundle --minify --format=esm --platform=node --splitting` over a fixture importing the
default export on each side). U5 ("a drop-in weighs no more than the incumbent it replaces") does
not hold for it, and `lighter-than-exit-hook` reads *not met* on the claim table.

closeout's README (`## Weight`) already says the drop-in is over on a different measure, the
published JavaScript by hand (11,841 B against 4,458 B). This row is the first time the bundled
figure is measured, and it is gated: the ceiling is the measurement plus the 80 B CI margin,
rounded up, so it cannot grow unremarked. How the 3,174 B divide inside closeout is *unmeasured*
here.

**Closed 2026-10-20** by [`closeout-at-incumbent-weight`](../intents/closeout-at-incumbent-weight/intent.md):
`closeout/exit-hook` reads **1,579 B** against exit-hook's 1,645 B (**0.960**), and the `RATIO_CEILING` row is U5's 1
(D-20261020-closeout-drop-in-budgets). The decision this gap asked for is
D-20261012-closeout-drop-ins-held-to-u5: held to U5 on its own.
