---
id: B-20261012-extra-typings-bundles-heavier
section: B
status: open
source: extra-typings-drop-in R5
recommendation: 'Accept the overage as `burgee/commander`''s, not this door''s: the façade adds one line of JavaScript, so the door weighs exactly what `burgee/commander` weighs, and a smaller door means a smaller commander front-end, which is that intent''s to decide. Keep the row a ratchet in `subpath-weight-lock.test.ts` (`OVER_INCUMBENT`) so it cannot grow, and move it to `DROP_IN_CEILINGS` the day it bundles at or under the incumbent'
---

`burgee/commander/extra-typings` bundles to **61,207 B** (`/docs/weight`, "Everything",
`esbuild --bundle --minify --format=esm --platform=node --splitting`). What a user installs
today for the same import, `@commander-js/extra-typings` 15.0.0 plus `commander` 15.0.0,
bundles to **39,329 B** by the method `DROP_IN_CEILINGS` records (`export * from
'@commander-js/extra-typings'`, no default to add, minified ESM for node; measured 2026-10-12
from a scratch install of exactly those two versions). The door is 21,878 B heavier, and U5
("a drop-in façade weighs no more than the incumbent it replaces") does not hold for it.

None of the difference is this door's. Its JavaScript is `export * from '../commander.js'`,
and its row on the page is `burgee/commander`'s to the byte: the declarations are the whole of
what it adds, and no bundle counts a declaration. How the 21,878 B divide inside
`burgee/commander` is *unmeasured* here; it carries what burgee projects from the same program
(`--json`, `--schema`, the manifest, the E1 exit codes) and `bellpull/cross-spawn` where
commander calls `child_process.spawn`.
On the measure the commander front-end has always been held to, bytes on disk of the static
walk (`packages/burgee/src/weight.test.ts`), the door is 115,356 B against 126,392 B for the
incumbent pair (commander 15.0.0's `index.js` and `lib/`, 126,365 B, plus extra-typings' 27 B
`index.js`, measured from the same scratch install), so it is lighter there.

The decision asked for: whether a drop-in that only re-exports a front-end is held to U5 on
its own, or inherits the front-end's position. Closing this without the decision would mean
either shrinking `burgee/commander` by a fifth (a separate intent) or writing a ceiling the
row does not meet.
