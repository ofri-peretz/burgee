---
id: D-20261113-surface-weight-drift-is-not-news
subject: 'upstream-watch R4: a weight-only move on a competitor nothing weighs files no issue'
taken: Taken
date: '2026-11-13'
superseded_by: —
---

**When a competitor's version, tarball, files and exports are unchanged and only its resolved tree's
weight moved, the daily watch files an issue only if something we publish depends on that weight.**
That means the strongest claim against it is `weight` or `compat`, or its figure is cited in our
tree: a `seen.cited` entry, or a figure next to its name in the owning package's README or
`weight.test.ts`. A `surface` claim with nothing cited states no byte count, so the move cannot make
anything false.

The reason is three issues for one release. `@stryker-mutator/core` 10.1.1 was filed as #1524, #1539
and #1562, each with the same version, sha1 and files. Its 173-package tree drifted by +104 B,
+34,759 B and +775 B, because caret-ranged transitive dependencies publish on their own schedule.
oxmutate's claim against Stryker is `surface`. Each issue proposed no changeset, and the only fix was
to re-record a number nothing reads. Recording the fingerprint (#1548, #1563) holds only until the
next transitive publish, so the issue would keep coming back.

What is not changed:

- A new version, a new tarball under the same version, or any moved file or export is still filed
  for every claim, `surface` included.
- `--fingerprint` still records the weight, so the weight held for a `surface` competitor is current
  whenever someone re-records. The daily log names the drift (`weight not claimed`) instead of saying
  nothing.
- A `surface` claim whose figure is quoted is still filed. flagstaff's string-width-in-ora's-bill is
  `surface`, and `weight.test.ts` quotes its bytes.

Over today's 56 watches this silences weight-only drift on two: `@stryker-mutator/core` and
`cli-boxes`. `cli-boxes` has no dependencies, so its weight cannot move without a new tarball anyway.

Reversed by making `weighs()` in `packages/compat-oracle/src/watch.ts` return true, or by giving the
claim a `weight` claim or a citation once oxmutate publishes a byte comparison against Stryker.
