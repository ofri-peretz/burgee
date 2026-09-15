---
'seniority': patch
---

`mergeAll` refuses `prototype` as well as `__proto__` and `constructor`, and the guard is
three comparisons rather than a `Set` lookup.

The guard existed and had no test — it was written, and believed. CodeQL's
`js/prototype-polluting-function` could not see it through the `Set` binding and blocked a
merge on it, which is a fair complaint about a security guard: one a reader has to follow a
binding to find is one a reviewer will miss too.

What it actually prevents, measured rather than assumed. A first attempt at the test asserted
`({}).polluted === undefined` after merging a `__proto__` key and **passed with the guard
deleted** — `target['__proto__'] = v` goes through the setter and swaps *that object's*
prototype; it does not write `Object.prototype`. The damage is narrower and quieter: the
config object handed back to the caller silently inherits whatever the file said, so
`config.isAdmin` can answer for a key no file set at the top level. `cosmiconfig-util.test.ts`
now asserts that, and four of its six cases go red when the guard is removed.
