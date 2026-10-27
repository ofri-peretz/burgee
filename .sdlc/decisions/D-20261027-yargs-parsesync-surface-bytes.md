---
id: D-20261027-yargs-parsesync-surface-bytes
subject: 'A-20261027-yargs-parsesync-surfaces-throw costs `./yargs` 56 bytes on its static walk. The ceiling had 1 byte to spare. Raise it, or find the bytes elsewhere?'
taken: Taken
date: '2026-10-27'
superseded_by: —
---

**Raise it. `./yargs` 221,700 → 221,800, `./yargs/v17` 224,750 → 224,850 and
`./yargs/v17/yargs` 225,000 → 225,100.** Each ceiling is the clean-build measurement plus the
~32 B that CI reads heavier, rounded up to the next 50 B, the same rule as every earlier raise in
`packages/burgee/src/weight.test.ts`. The coordinator took this under the owner's delegation for
burgee budgets.

**What the 56 B buy.** `.parseSync()` is yargs' documented synchronous entry. Until this change,
every `burgee/yargs` program that used it crashed with a `YError` stack trace on `prog --mcp` and
on `prog completion <anything>`, because both surfaces lazy-load their modules and handed
`parseSync()` a promise. open-cli-tools/concurrently is one such program, and the crash holds
the first-adopter pull request. The fix has three parts:

- a `#sync` flag that `parseSync()` sets around its `parse()`, reset in a `finally`;
- `completions.js` required synchronously under that flag, so the script prints and the
  process exits before `parseSync()` returns, as `--help` does;
- `--mcp` returning `true` rather than its promise under the flag.

Main at `c5e86d3044` measured 221,699 / 224,741 / 224,965; this branch measures 221,755 /
224,797 / 225,021. One part shrank: the shell is now checked against a literal list before
`completions.js` loads, so `completion foo` no longer loads the module. Bundled (`npm run weight:page`),
`burgee/yargs` goes from 109,189 to 109,250 B (+61). `burgee/yargs/v17` moves by the same 61 B, from
110,354 to 110,415, and that is over its incumbent: the `OVER_INCUMBENT` ratchet in
`scripts/subpath-weight-lock.test.ts` rises with it (gap B-20261019-yargs-17-entry-bundles-heavier,
unchanged in kind).

**The lazy loading is kept, not traded.** Making `completions.js` a static import would answer
`parseSync()` without the flag, but it would put 18,058 B on the start-up path of every
`burgee/yargs` program. That is the shape removed for `mcp.js` on 2026-09-22 (2,520 B, recorded
in the same file). The synchronous load is `require(esm)` through the shim's own
`createRequire`. The engines floor `^20.19.0 || >=22.13.0` guarantees `require(esm)`, and
`yargs/v17.cts` already relies on it.

**Rejected.**

- *Dropping the `try/finally` around the flag* (about 30 B). A `parse()` that throws, for
  example a `.fail(false)` program whose handler throws, would leave the flag set. The next
  `parseAsync()` on that instance would then resolve before its MCP server had finished.
- *Importing `SHELLS` for the pre-load check rather than spelling the list.* That puts the
  18 KB module back on the static walk. `parse-sync-surfaces.test.ts` runs every entry of
  `SHELLS` through the façade instead, so a shell added there and not here fails the test.

**Not moved.** The `lighter-than-commander` claim (1.417×) measures `burgee/commander`, which
this change does not touch.
