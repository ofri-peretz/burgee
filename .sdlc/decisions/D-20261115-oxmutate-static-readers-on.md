---
id: D-20261115-oxmutate-static-readers-on
subject: 'oxmutate-fastest 2.4: may a static mutant run only in the test files that read its value, and on what terms?'
taken: 'Taken — by the session building oxmutate-fastest, on the owner''s delegation of 2026-11-11 ("You can make all calls")'
date: '2026-11-15'
superseded_by: —
---

**Yes, as `static.readers: 'on'` (`--static-readers`), off by default, audited on every run.**

**What it does.** The tracking dry run of `static.readers: 'report'` records which test files read
each tracked static value. With `'on'`, a static mutant runs only in its loaders that read its
value. A value nothing tracks, one read while no test file was current, or every value when the
tracking run failed a test, keeps every loader.

**The guard.** One survivor in twenty that ran in fewer files than load its module runs again in
all of them. One that fails there is reported Killed, counted, and the run exits 1 naming the
option (`cli.ts`).

**Measured.** compat-oracle `src/hosts.ts:699-760`, 81 mutants, 4 workers, each run alone on the
machine beside another session's run (loads 17.5 and 19.9):

| | Wall | Static phase |
| :-- | --: | --: |
| `static.readers` off | 4,185 s | 2,572 s, then 60 to the fresh-worker path (1,533 s) |
| `static.readers: 'on'` | **1,169 s (3.6x)** | 1,048 s, none to the fresh-worker path |

80 of 81 verdicts equal. The one that differs (`hosts.ts:699`, `'ipc'` emptied in a list of
execa directory names) was Killed off and Survived on. Its kill was the whole of `uvu.test.ts`
failing in a fresh worker, a file that spawns processes under suite timeouts and never reads
execa's directories. A second run with today's file selection gave Survived after 806 tests, as
`'on'` did. The baseline disagreed with itself, which `bench/ab.mjs` calls unstable, not a
difference. Three fixtures, with every survivor audited, give identical verdicts and no audit
disagreement (`e2e.test.ts`).

**Why off by default.** A missed reader is a false Survived. The tracking sees reads through
property access, `in`, descriptors and enumeration on tracked literals, and attributes a read
during a file's collection to that file; it cannot see a value that leaves a tracked literal by a
path that fires none of those. The audit is the net for that, and a default is the owner's call,
as `static.group`'s is (spec `R6`).

**Reversible.** One option, off by default.
