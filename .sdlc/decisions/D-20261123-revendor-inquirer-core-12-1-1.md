---
id: D-20261123-revendor-inquirer-core-12-1-1
subject: '@inquirer/core 12.1.1 was published on 2026-11-22. What did the inquirer-core row and caique/inquirer need?'
taken: 'Taken — the owner started the "close the inquirer-core compatibility gap" thread on 2026-11-22'
date: '2026-11-23'
superseded_by: —
---

**The gap the thread was opened for was already closed.** `.sdlc/FINISH-ALL.md` still listed
inquirer-core at 0 / 41 against `caique`. The row moved to `caique/inquirer` on 2026-09-20 and
read 47 / 47 at 12.1.0 (D-20261112-upstream-issues-2026-11-12). The tracker row is corrected
here, as is the caique spec's paragraph calling `usePagination` unimplemented; it is built and
graded by `select`'s pagination suite (D-20261011-inquirer-pagination-suite-is-selects).

**The real gap was 12.1.1, one day old.** Re-vendored at its tag with
`npx tsx scripts/vendor-suite.ts inquirer-core --version 12.1.1`, `suiteDeps` moved to core
12.1.1, ansi 2.1.1 and testing 3.4.1. Measured on linux x64, Node 24.13.0:

| Host | Release | Control | Target at the re-vendor | Target now | Before |
| :-- | :-- | --: | --: | --: | --: |
| inquirer-core | 12.1.0 -> 12.1.1 | 47 / 47 | 47 / 47 | 47 / 47 | 47 / 47 |

The suite moved one assertion (an enter keypress is reported as `return`, from the testing
package's real `\r`). **The three behaviour changes in 12.1.1 are graded by nothing in it**, so
each was read off the real 12.1.1 with a probe, then held to literals in
`packages/caique/src/inquirer-release-12-1-1.test.ts`, red first:

- **Ctrl+D on a terminal** rejects with `ExitPromptError('User force closed the prompt with
  EOF')`. A pipe that drains only clears effect timers, as before. caique left the TTY prompt
  pending.
- **A deferred paint.** State an effect sets inside the re-render a keypress asked for was
  recorded and never drawn: a search prompt stayed `idle` while its fetch ran. One paint now
  goes to a microtask (the real `queueMicrotask`, taken at load), and settling cancels it.
  caique drew `idle a` where 12.1.1 draws `loading a`.
- **The right edge in columns.** `ScreenManager` measured the prompt line in code units, so a
  line of CJK characters that fills the terminal kept the cursor on the filled row. It is
  measured with `linegauge/wrap`'s `visibleWidth`, which the façade already reached, so the
  dependency set is unchanged.

**Weight.** `npm run weight:converge` moved caique's band 303,281 -> 304,657 (ratio 0.7795 ->
0.7831). The `@inquirer/core` incumbent figure is not re-fingerprinted: 12.1.1 adds
`fast-string-width`, and no issue names it yet (D-20261026-fingerprint-missing-not-rerecord).

**Not done here.** `@inquirer/prompts` 8.8.1 was published the same day with a much larger suite
change (search +296 lines, new rawlist and select cases, `@inquirer/testing` key sequences).
Its row stays at 8.8.0 and 228 / 228, and it is the next re-vendor.
