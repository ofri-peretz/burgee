---
id: D-20261113-oxmutate-static-group-disjoint
subject: 'oxmutate-fastest R4: which static mutants may share a group — different top-level statements, or any two that touch different source text?'
taken: 'Taken — by the session building oxmutate-fastest, on the owner''s delegation of 2026-11-11 ("You can make all calls")'
date: '2026-11-13'
superseded_by: —
---

**A group of static mutants holds no two that touch the same source text: neither inside the
other, nor overlapping. The spec's rule, "different top-level statements", is replaced by it.**

**Why the spec's rule could not stand.** `static.group` exists for files like compat-oracle's
`hosts.ts`: one exported array of about 1,800 lines, which is one top-level statement. Under
"different top-level statements" none of its mutants could share a group, and the file the
option was written for would gain nothing. That file is 963 of the package's 1,662 survivors and
most of its 50,743 s static phase (2026-11-05).

**What the new rule keeps out.** The pair most able to hide each other: a mutant and one inside
it. An object literal emptied to `{}` removes the string a second mutant changes, so the pair
behaves as the first alone. Two replacements of one node are the same case. `disjointGroups`
(`coordinator.ts`) places a mutant in the first group that has room and nothing it overlaps;
`static-group.test.ts` holds it.

**What it does not keep out.** Two mutants in different places whose effects cancel: one changes
a value, the other the check on it. No rule on source positions excludes that. The guards are
the ones the spec already had, and they now carry more weight:

- the option is off by default (`static.group: 1`);
- one group survivor in twenty is run again alone, on every run; one that fails alone is
  reported Killed, counted in `staticAuditDisagreed`, and the run exits 1;
- the first file a mutant runs in, the one most likely to kill it, is never grouped.

**Reversible.** A rule inside one function, behind an option that is off.
