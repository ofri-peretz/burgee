---
"hookset": minor
---

Add `coverage()` and `coverageText()` (`src/changesets.ts`): every package a pull request ships a change to must be named in one of its changesets. Source that is not a test, fixture or snapshot counts, and so does a manifest change beyond `devDependencies`. The shared `changeset-gate` workflow runs it at the hookset tag `lefthook.yml` pins. Test-only changes no longer need a changeset or the `skip-changeset` label.
