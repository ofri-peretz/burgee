---
id: D-20261007-eval-builds-first
subject: 'Should the authoring eval build the packages before the cases run'
taken: Taken
date: '2026-10-07'
superseded_by: —
---

**Yes.** `evals.yml` now runs `npx turbo run build --filter='./packages/*'` before
`run-evals.ts`.

The eval measures one claim: a package's `schema.json` and README are enough for an agent to
write a working plugin in a single prompt (U9, D-143). An agent working in a real project gets
the package from npm, and that install includes `dist/`. The CI checkout has no `dist/`. So
every case first had to discover how to build before `node packages/<pkg>/dist/cli.js check`
could run. For burgee this was worst: its own build fails alone, and its CLI then crashes on
a missing `seniority/dist`. Those turns measured the job's checkout, not the documents.

The cases, the 12-turn cap (D-20261006-eval-turn-budget) and the grading are unchanged. The
READMEs still say how to build from a clone (#848), so an agent that needs to can still find it.

`run-evals.test.ts` fails if the build step is missing or comes after the eval step.
