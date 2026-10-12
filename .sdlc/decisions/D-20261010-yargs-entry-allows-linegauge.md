---
id: D-20261010-yargs-entry-allows-linegauge
subject: 'The `./yargs` weight rule reads `allow: []`, and the built entry statically imports `linegauge`. Restate the rule, or take linegauge out of the façade?'
taken: Owner
date: '2026-10-10'
superseded_by: —
---

**Default: the rule is restated to `allow: ["linegauge"]`. The byte budget does not move.**
That holds until the owner says otherwise. The restated rule is in
`packages/burgee/src/weight.test.ts`.

The edge already shipped. `dist/yargs.js` reaches `yargs/shim.js`, then `yargs/cliui.js`, then
`import { strip, width, wrap } from "linegauge"`. The lock never saw it because every dist
walker matched `from '…'` only, and tsc keeps the source's quote style, so all of
`src/yargs/*.ts` was double-quoted and unread. The rule's own note already recorded the gap
and named the walker, not the number, as the thing to fix. The walkers now read the syntax
tree, and the rule fails until it says what ships.

This goes to the owner because an `allow` list is a ceiling and this widens it. The
alternative is to fix the code: drop linegauge from the façade and restore cliui's own
`stringWidth` and `stripAnsi`. That brings back the bug linegauge was imported to fix. The
T.416 colon form `ESC[38:2::255:0:0m` measured 13 columns as 25, and every help screen wrapped
against the wrong width. Two width functions give two answers. Restating the rule is the
smaller diff and the one the tree already proves.

What did not change: the walk measured **220,888 B over 23 files** for `./yargs` with the old
pattern and with the new walker. Every relative file was already reached through some
single-quoted path, so the budget of 220,900 holds as it was. linegauge's own bytes still
leave the measurement at the bare import, as they do for `./help`. The parity note's "only
lighter, never heavier" claim is still a statement about burgee's files, not about the
install. The `cold-start/burgee-yargs.mjs` fixture is what measures the eight linegauge files
loading at runtime.
