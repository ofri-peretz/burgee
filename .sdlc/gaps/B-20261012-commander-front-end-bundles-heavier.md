---
id: B-20261012-commander-front-end-bundles-heavier
section: B
status: open
source: commander-front-end-diet R4
recommendation: 'Hold the row as an `OVER_INCUMBENT` ratchet in `subpath-weight-lock.test.ts`, lowered to each measurement, with every byte over commander named in the spec''s residual table. Decided by D-20261012-commander-front-end-floor: no surface is deleted to fit, and what a synchronous `parse()` answers stays static. Move the row to `DROP_IN_CEILINGS` and close this the day it bundles at or under 39,329 B'
---

`burgee/commander` bundles heavier than commander 15.0.0, the package it replaces. The
measurement is `/docs/weight`'s "Everything" column (`export * from 'burgee/commander'`, `esbuild
--bundle --minify --format=esm --platform=node --splitting`, initial load), against
**39,329 B** for commander by the same method.

| Step | `burgee/commander` | Over commander |
| :-- | --: | --: |
| `main` at `10edb48` | 61,207 | 21,878 |
| `main` after #1064 (`schema.js` +65) | 61,272 | 21,943 |
| R1, the spawn | 56,418 | 17,089 |
| R2, the lazy routers | 55,661 | 16,332 |

[`commander-front-end-diet`](../intents/commander-front-end-diet/spec.md) attributes every byte
by module. The port of commander itself is at parity. What's left is what burgee adds and a
synchronous `parse()` has to answer: `--schema`, `use()`'s plugin check, and the `--json`
envelope with the E1 floor. `scripts/commander-front-end-lock.test.ts` holds the module set, and
the `OVER_INCUMBENT` row holds the number. Neither can go up without a red run.

`burgee/commander/extra-typings` (#1039) re-exports this front-end byte for byte. Its own gap,
`B-20261012-extra-typings-bundles-heavier`, was closed by deciding that the door inherits this
one's position, so its `OVER_INCUMBENT` row moves with this one.
