# CLAUDE.md

Map, commands and package layout: [AGENTS.md](./AGENTS.md). This file holds only what changes
how you work in every session; every other rule is a check whose failure message names the fix.

- `npm run ci:local` is the pre-push gate (typecheck + test + build). `npm run lint` is a
  separate CI job and is not in it: run it too.
- `git push` runs that gate plus the changed-lines mutation lane: 3–4 minutes, not a hang.
- Turbo rebuilds dependents: a `packages/*` change can make `turbo run test` far slower than the
  package's own vitest run.
- Every number in prose comes from a file in this repo (a generated page, a baseline, a band);
  a claim that cannot be measured is written as _unmeasured_. (judgment, until proofline)
