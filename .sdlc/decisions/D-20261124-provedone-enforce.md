---
id: D-20261124-provedone-enforce
subject: "Does the provedone commit gate block now, before its 14-day observe warm-up ends?"
taken: 'enforce now, in burgee and through the hookset commit-msg preset in every repo — the owner, 2026-11-24 ("keep processing", relayed with the ask to make provedone blocking)'
date: "2026-11-24"
superseded_by: —
---

**The provedone gate moves from `observe` to `enforce` now.** burgee's own `commit-msg` hook runs
`provedone gate --mode enforce`, and the hookset `commit-msg` preset gains an enforced
`hookset-provedone` station (`npm run hook:provedone -- {1}`), so every repo that pins the next
hookset release blocks a commit with no receipt.

This overrides the warm-up default in the provedone intent (observe for 14 days, promote under a 2%
false-block rate). The owner chose the end state now rather than after the measurement window. The
false-block rate is still read from `.git/provedone/gate.jsonl`, which `enforce` keeps writing.

What keeps it from trapping anyone:

- A commit with nothing to verify passes with `Verified-by: none (<why>)`.
- Merge commits pass (`Merge …` subjects).
- After two blocks in one session the next commit passes and is logged as a bypass
  (`ESCAPE_AFTER` in `packages/provedone/src/gate.ts`).
- The block message names the trailer to add.

Revisit when the log shows a false-block rate over 2% on 14 days of commits; a lower mode is a
new decision file.
