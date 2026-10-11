---
"seniority": patch
"burgee": patch
---

`seniority/find-up` is now find-up 8's surface, graded by find-up 8.0.0's own suite: 104 of 104, level with find-up itself. It adds a matcher function with `findUpStop`, `findDown` and `findDownSync`, and locate-path's `type` and `allowSymlinks`; `cwd` and `stopAt` take a `URL`. Three behaviours follow find-up rather than seniority's resolver walk: `cwd` is optional and defaults to the process's working directory, a name matches a file unless `type` says otherwise, and `findUpMultiple` returns the first matching name per directory. `burgee migrate` now rewrites `find-up` to `seniority/find-up`.
