---
id: D-20261012-burgee-tarball-rebaseline
subject: '`check-published-artifacts` refuses burgee at +10.2% over its 2026-10-11 tarball figure: is the growth re-recorded, or trimmed first?'
taken: 'Taken — on the owner''s delegation of 2026-10-12, "You''re managing the baselines and you need to use your judgement to decide if something is reasonable"'
date: '2026-10-12'
superseded_by: —
---

**Re-recorded at what npm serves for burgee 1.3.0: 225,278 -> 246,526 B gzipped and 865,969 ->
938,302 B unpacked (+9.4%, +8.4%), 178 files. No other package's figure moves, and the 10%
allowance in `scripts/check-published-artifacts.ts` now runs from there.** This is a band
moving in the loosening direction, which `DECISIONS.md` sends to the owner; the owner
delegated baselines in writing on 2026-10-12, and this is that delegation used.

**Value gained.** The growth is shipped product, not drift. Between the 2026-10-11 figure and
1.3.0, burgee gained locale packs for help and refusals (#1044), `--skill` and `burgee skill`
(#1043), MCP `structuredContent`, `outputSchema`, cancellation, progress and `--print-config`
(#1047, #1051, #1061, #1048), and Markdown help (#1034). #1064 trips the check at 248,182 B
only because the figure was never moved for what had already shipped.

**Bytes paid.** +21,248 B gzipped and +72,333 B unpacked against the 2026-10-11 figure, measured
with `npm pack burgee@1.3.0 --dry-run --json` on 2026-10-12. The check compares a build of the
tree, so the figure is the published pack rather than any one branch's build.

**What the incumbent pays.** commander 15.0.0 packs at 52,736 B gzipped (207,368 B unpacked)
and yargs 18.0.0 at 47,876 B (231,436 B) before its six dependencies, measured the same way on
2026-10-12. Neither ships an agent skill file or an MCP server: a program that wants one from
them adds `@modelcontextprotocol/sdk`, whose 1.32.1 tarball alone is 615,784 B gzipped
(4,490,363 B unpacked), plus its own schema layer. burgee's tarball is larger than either
incumbent's and smaller than the incumbent stack that does the same job. The per-entry budgets
in `packages/burgee/src/weight.test.ts` and the bundle ratchets are what hold a program's
runtime cost, and none of them moves here: the tarball is what an install downloads once, not
what a run loads.

**Measured, so the next trim starts from facts.**

- **Declarations are 240,393 B of the 938,302 unpacked** (52 `.d.ts` files), and keep their doc
  comments by the `.d.ts` rule in `scripts/strip-comments.mjs`: they are the hover text an
  editor shows.
- **Shipping `.d.ts` without doc comments would cut about 46,300 B gzipped** (246,526 ->
  200,214, -18.8%) **and 125,065 B unpacked** (240,393 -> 115,328 of declarations; 938,302 ->
  813,237 in all). Measured on a copy of the 1.3.0 tarball with a copy of `strip-comments.mjs`
  that also prints each `.d.ts` through TypeScript's printer with `removeComments`; the printer
  alone, comments kept, adds 72 B gzipped, so the comments are the rest. That is an option for
  a follow-up, not taken here: it trades editor hover text for bytes, and the rule stays as it
  is in this change.
- **The shipped JSON is already minified.** Re-serialising the four `dist/*.json` files saves
  0 B. The 29 locale packs under `locales/` (63,091 B) are pretty-printed and would save 346 B
  gzipped, 6,016 B unpacked, if minified.

**Reversal.** Lower the `burgee` row of `.sdlc/bands/artifact-size-baseline.json` to the next
measured pack and add a dated paragraph to its `$comment`. Lowering needs no permission. The
`.d.ts` trim above, if taken, is how the figure comes down by a fifth.
