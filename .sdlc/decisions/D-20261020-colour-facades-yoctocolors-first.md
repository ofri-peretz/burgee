---
id: D-20261020-colour-facades-yoctocolors-first
subject: 'colour-facades: does the first build pull request carry kleur and colorette beside yoctocolors?'
taken: 'No. yoctocolors ships alone, graded 78 / 78; kleur and colorette stay open in A-20261019-colour-facades-hosts-not-built, one pull request each (2026-10-20)'
date: '2026-10-20'
superseded_by: —
---

**yoctocolors alone.** The batch that built it was asked to add colorette and kleur to the same
pull request if they fitted without blowing the mutation lane's budget. They do not fit, for the
reason the accepted design gives and one it did not have to:

- **The design rejects it.** [`colour-facades/spec.md`](../intents/colour-facades/spec.md) lists
  "one pull request for all three" under *Rejected alternatives*: three oracle runner changes in
  one lane is the collision the one-lane rule exists to stop. The spec was accepted under the
  owner's delegation ([`D-20261019-colour-facades-design-accepted`](./D-20261019-colour-facades-design-accepted.md)),
  and a batch instruction does not reopen an accepted design.
- **Neither of the other two is a host row.** yoctocolors needed no oracle code: `extraDirs`
  vendors `fixture.js` and `entries` writes the `index.js` it imports, as cli-cursor's row does.
  kleur needs a `uvu` runner and a loader substitution (its `uvu -r esm` does not start on Node
  24), and colorette a runner that reads `twist`'s counts (it exits 0 with 58 of 67 failing) plus
  upstream CI's environment. Each is new code in `compat-oracle/src/run.ts`, which the PR lane
  mutates line by line; #1177's one `run.ts` change was measured package by package because the
  three packages together hit the lane's 11 minutes.

**What this pull request holds.** `roundel/yoctocolors` graded 78 / 78 against a control of
78 / 78; a B4 pair at 2,247 B against yoctocolors' 2,363 (0.951), ceiling 2,350; the whole surface
at 3,275 B against 3,395 on `/docs/weight`; a `DROP_INS` row with `burgee migrate` rewriting a
yoctocolors 2 program end to end and leaving 1 alone. The intent stays `approved`, with its Status
table naming yoctocolors' evidence and the two hosts still to build.

**Budgets set, none raised.** B4 `roundel/yoctocolors` 2,350 (the measurement plus the 80 B CI
margin, rounded up to the next fifty, which is still under yoctocolors' 2,363); `./yoctocolors`
3,250 B of reachable `dist` in roundel's `weight.test.ts` (measured 3,188); `DROP_IN_CEILINGS`
3,395, yoctocolors' own whole surface by the page's method. roundel's tarball stays inside its
recorded figure's allowance, so `.sdlc/bands/artifact-size-baseline.json` does not move.

**Alternative rejected.** Building colorette's drop-in without its runner, graded later: a
subpath with no grade is the `target not built yet` row in reverse, a published path nothing
measures, and `burgee migrate` could not write it because `DROP_INS` follows the baselines.
