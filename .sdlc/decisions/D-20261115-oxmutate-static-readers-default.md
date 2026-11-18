---
id: D-20261115-oxmutate-static-readers-default
subject: "oxmutate-fastest 2.4: is static.readers on by default?"
taken: 'Taken — by the owner, 2026-11-15 ("close everything that is currently open … including the implementation of all potential improvements"), after the default was named as the owner''s call'
date: "2026-11-15"
superseded_by: —
---

**Yes: `static.readers: 'on'` is the default.** `static.readers: 'off'` or `--no-static-readers`
restores every loading file; `'report'` is unchanged.

**Why.** `D-20261115-oxmutate-static-readers-on` measured 4,185 s → 1,169 s (3.6x) on the compat-oracle
slice, 80 of 81 verdicts equal and the one difference a load-induced kill in the baseline. The audit
(one survivor in twenty re-run in every loading file, `OXMUTATE_STATIC_AUDIT=all` for all) runs on
every run and fails it on a disagreement, so a missed reader cannot pass silently.

**What changed with it.** The read-tracking dry run is skipped when every source holding tracked
mutants is loaded by one test file: there is no file to leave out, and the run would be pure cost
(a fixture case covers it).

**Reversal:** one line in `config.ts`; nothing persisted depends on the default.
