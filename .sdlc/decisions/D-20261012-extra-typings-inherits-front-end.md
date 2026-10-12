---
id: D-20261012-extra-typings-inherits-front-end
subject: 'Is a drop-in that only re-exports a front-end held to U5 on its own, or does it inherit the front-end''s position? (B-20261012-extra-typings-bundles-heavier)'
taken: 'Taken — on the owner''s delegation of 2026-10-12, "we need to WIN everybody else in the trade-off of value, performance, scale, robustness"'
date: '2026-10-12'
superseded_by: —
---

**It inherits the front-end's position under U5 and is not held to it separately.
`burgee/commander/extra-typings` is one line of JavaScript, `export * from '../commander.js'`,
so it weighs exactly what `burgee/commander` weighs, and the target is `burgee/commander`
itself.** This answers gap B-20261012-extra-typings-bundles-heavier, raised on #1039's branch:
its row stays a ratchet in `subpath-weight-lock.test.ts` (`OVER_INCUMBENT`) so it cannot grow,
and it moves to `DROP_IN_CEILINGS` the day `burgee/commander` bundles at or under the incumbent.

**Value gained.** The extra-typings door, graded 369 / 369 by the incumbent's own `tsd` suite,
lands without a ceiling written for a row that does not meet it, and without shrinking
`burgee/commander` by a fifth inside a typings PR.

**Bytes paid.** None of its own. The façade adds one `export *` line and declarations; no
bundle counts a declaration. Bundled (`esbuild --bundle --minify --format=esm
--platform=node --splitting`), `burgee/commander` is **61,207 B**.

**What the incumbent pays.** `@commander-js/extra-typings` 15.0.0 plus `commander` 15.0.0
bundle to **39,329 B** by the same method: 21,878 B less. On bytes on disk of the static walk,
the measure `packages/burgee/src/weight.test.ts` holds the commander front-end to, the door is
115,356 B against 126,392 B for the pair, so lighter there. The bundled gap is a real loss
against the incumbent, and it belongs to the front-end: burgee carries `--json`, `--schema`,
the manifest and the E1 exit codes from the same program, and `bellpull/cross-spawn` where
commander calls `child_process.spawn`.

**Follow-up.** An intent, `commander-front-end-diet`, is opened separately to bring
`burgee/commander`'s bundle to or under the incumbent pair. Every re-exporting door moves with
it.

**Reversal.** A new decision holding re-exporting doors to U5 on their own, which would mean
writing a ceiling for this row in `DROP_IN_CEILINGS` that it fails until the front-end shrinks.
