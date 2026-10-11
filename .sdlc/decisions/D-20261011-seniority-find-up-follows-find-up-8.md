---
id: D-20261011-seniority-find-up-follows-find-up-8
subject: '`seniority/find-up` called itself the override target for `find-up` while no suite graded it: does the subpath take find-up''s behaviour, or does a façade sit beside it?'
taken: Taken
date: '2026-10-11'
superseded_by: —
---

**The subpath takes find-up 8's behaviour. find-up 8.0.0's suite grades it 104 / 104, level with a control of 104 / 104** (`graded-override-targets` R2). Measured on darwin arm64, Node 24.13.0.

`graded-override-targets/spec.md` R2 says the drop-in is the existing subpath. The intent's constraint is narrower: a façade beside the subpath only where the subpath's API differs and other code relies on it. Nothing else in the family imports `seniority/find-up` except `burgee/meow`, whose one call (`findUpMultipleSync('package.json', { cwd })`) returns the same answer under both behaviours. The resolver's walk is `search.ts`, and it stays bounded and name-only for config discovery.

The first target run failed at link time: `does not provide an export named 'findUpStop'`. Three behaviours then differed from find-up, and each now follows it:

- **`cwd` is optional** and defaults to the process's working directory, read through `runtime.ts`. That file is the seam D-135 opens for every seniority drop-in whose incumbent reads the process by default. The suite calls `findUp(name)` with no options throughout.
- **A name matches a file** unless `type` says `'directory'` or `'both'`. That is locate-path's default; the walk used to match any entry.
- **`findUpMultiple` returns the first matching name per directory**, not every name. That is what locate-path returns.

On top of those, the subpath adds matcher functions and `findUpStop`, `findDown` / `findDownSync`, `allowSymlinks`, and a `URL` for `cwd` and `stopAt`. One behaviour deliberately differs: when `stopAt` is not an ancestor, the walk ends at the filesystem root. find-up 8 compares the root against `stopAt` forever there. No case grades this.

**Excluded by exact title, from both sides:** `findup › async (dot file)` and `findup › sync (dot file)`. Each expects `<package root>/.git` to be a directory, which no vendored copy has. find-up 8.0.0 itself finds the enclosing repository's `.git` instead, and fails both.

**For the owner.** `seniority`'s changeset is a `patch`. A caller of `findUpMultiple(['a', 'b'])` that found both names in one directory now gets one of them, and a name that was a directory now needs `type: 'directory'`. Both are find-up's behaviour, and this subpath exists to be find-up.
