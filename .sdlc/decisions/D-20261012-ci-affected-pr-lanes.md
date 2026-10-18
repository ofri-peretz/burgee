---
id: D-20261012-ci-affected-pr-lanes
subject: 'Does a pull request run every package''s suite on every cell, or only what it can have changed?'
taken: 'Taken — on the owner''s delegation of 2026-10-12 over budgets and trade-offs'
date: '2026-10-12'
superseded_by: —
---

**A pull request runs the packages it changed and every package that depends on one; `main`,
the merge queue, the weekly scan and a `run-full-ci` label run everything.** The repository's
own locks (`vitest.root.config.ts`) and the compat ratchet always run in full, because they
read the whole tree. A PR that changes a workflow, a root config, `package-lock.json` or
`scripts/` is treated as touching every package.

**Why.** On 2026-10-12, 24 of the last 30 completed Compatibility runs were cancelled before
they finished, and every pull request ran the same 13 jobs (one ratchet, six `matrix` cells and
six `floor` cells) whether it changed a package or only a benchmark JSON file (#1062, #1081).
The account runs about six jobs at a time, so a data-only PR held the queue as long as a
parser change did.

**What it risks.** A change that breaks a package it does not declare a dependency on. The
`coverage` job in `quality-full.yml` has run affected-only since 2026-09-30 and records one such
race (controlroom with `facade-types.test.ts`), fixed by building every package first; the
same rule is kept. A full run on `main` after every merge catches anything the PR lane missed,
and the broken-main reporter in `compat.yml` already opens an issue when it does.

**Reversal.** Remove the filter; the full matrix runs on every PR again.
