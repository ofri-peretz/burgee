---
"closeout": minor
"burgee": patch
---

Two new drop-in subpaths, each graded by its incumbent's own suite and level with it. `closeout/onetime` is onetime 8 (6 of 6): the default export, `callCount` and `{ throw: true }`, and like onetime it retries a first call that throws. `closeout/cli-cursor` is cli-cursor 5 (8 of 8): `{ show, hide, toggle }` on `process.stderr` by default, and a hide arranges the show at exit through `closeout/restore-cursor`. `burgee migrate` now rewrites `onetime` and `cli-cursor`.

`closeout/restore-cursor` bundles 318 B less (4,648 to 4,330 B on /docs/weight): the process-wide `onExit` reaches the registry without the `Closeout` view, which carried the cursor pairing.
