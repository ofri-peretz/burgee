---
id: D-20261019-front-end-byte-steps-rebase-bands
subject: 'The front-end byte bands breached by #1154 were decided steps: attributed, not widened, and the series re-based where each step landed'
taken: 'Taken — on the owner''s delegation of 2026-10-12 over budgets and trade-offs'
date: '2026-10-19'
superseded_by: —
---

**`commander-front-end-bundled-bytes` and `yargs-front-end-bundled-bytes` stay at their window,
`minPoints` and direction. Each now re-bases at the first observation of every decided step:
`2026-10-19-28843a5-ci` for both, and `2026-10-19-a34a8ee-ci` for yargs too
(`rebase` in `.sdlc/bands/control-bands.json`). Nothing is widened.**

## What #1154 saw, and what caused it

The watcher opened #1154 with two 2σ breaches, "2 of 3 beyond 2σ, above". Both series had sat on
one value since 2026-10-13, so σ was about 1.8 B, and three points 5 B higher read as drift.

| band | before | after | step | cause |
| :-- | --: | --: | --: | :-- |
| `commander-front-end-bundled-bytes` | 55,346 | 55,351 | +5 | #1139 (`28843a5`). fix-lines-every-shell quotes a fix line for the shell that runs it, a deliberate fix, and the B4 fixture of `burgee/commander` reaches it. |
| `yargs-front-end-bundled-bytes` | 108,345 | 108,350 | +5 | #1139, the same change through `burgee/yargs`. |
| `yargs-front-end-bundled-bytes` | 108,350 | 108,769 (local) | +419 | #1152 (`a34a8ee`). facade-projection-fidelity R4 projects yargs' `.conflicts()`, `.implies()` and `.example()`. Decided in D-20261019-yargs-facade-relations-bytes, which moved the ceiling to 108,850. |

The two +5 B steps were never recorded anywhere. #1139 changed every commander and yargs entry and
did not regenerate `/docs/weight`. That is now gated as well: `npm run weight:page -- --check`
runs in compat.yml's `ratchet` job.

PR #1154 is not merged. Its draft intents are answered by this file. The steps are attributed here,
and the next watcher run computes both bands from the step.

## Why re-base and not widen

A widened band would hide the next real 5 B regression as well, and a byte series exists to catch
exactly that. Removing the old points does not do this. The band is computed from the first point
at the new level, and it reports "band not computed yet" until it has `minPoints` (8) there. From
then on it gates around the new value with the same σ rules, so a later step that no decision
names breaches again. `scripts/control-bands.test.ts` › `a decided step re-bases the band` holds
all of this. On the old watcher it reads `expected { …(8) } to be null`, and the intent it writes
lists the pre-step points.

## Rule for later steps

A PR that moves a deterministic byte series on purpose records a decision. The band's `rebase`
list then names that decision and the first CI observation at the new level, `<date>-<sha>-ci`.
`scripts/control-bands-rebase-lock.test.ts` fails a `rebase` entry when its decision file is
missing, or when the file does not name both the band and the observation. A `from` whose
observation has not been recorded yet does nothing until it is recorded, so the decision can merge
first.
