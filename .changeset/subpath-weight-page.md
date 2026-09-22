---
'benchmarks': patch
---

A weight for every published subpath, at both ends of the tree-shaking range.

B4 measures fifteen *pairs* — an entry point of ours against the package it replaces — which is
the right shape for a claim and covers fifteen of the **77 code subpaths this repository
publishes**. A consumer reaching for `flagstaff/progress`, `caique/decide` or `seniority/find-up`
had no number anywhere, and the per-package weight locks measure the on-disk static graph, which
is a different quantity from what a bundler puts in an application.

`/docs/weight` prices all 77, with **every export of every one bundled on its own** — about six
hundred esbuild runs, forty-five seconds — because "what does this import cost" has no single
answer:

| | | |
| :--- | :--- | :--- |
| **Cheapest** | the export that costs least, by name | `burgee/mcp` → `MCP_PROTOCOL_VERSION` 54 B |
| **Dearest** | the export that costs most, by name | `burgee/mcp` → `serveMcp` 4,001 B |
| **Everything** | the whole namespace, nothing shaken away | `burgee/mcp` → 4,059 B |

A wide spread means the subpath shakes well and most consumers pay near the left-hand number.
A narrow one means it arrives as a unit — `burgee/yargs` is 105,222 B for its *cheapest* export
— which is worth knowing before importing it rather than after.

All three are the initial load, from the same function B4 uses, so the two pages cannot disagree
about what "bundled bytes" means.

`subpath-weight-lock.test.ts` fails when a published subpath has no row, when anything prices at
zero (`export *` does not re-export `default`, and that hole read `burgee/meow` — the largest
façade in the package — as **0 bytes**), and when the page's own generation stamp is more than
14 days old.
