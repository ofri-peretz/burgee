# Intent — What we improve: the output stack's research pass

> Stage 1 artifact. Child of [`cli-output-stack`](../cli-output-stack/intent.md). The
> engine's floor came from reading 329 open issues across five trackers. The three new
> layers have no equivalent yet; this intent produces it, and the floor rows for roundel,
> flagstaff and caique come from here, not from taste.

**Status:** draft · **Opened:** 2026-09-08 · **Owner:** @ofri-peretz

---

## What is wanted

`.sdlc/research/output-stack-open-issues.md`: every open issue — and, where a maintainer
closes by policy, every issue closed as *won't fix* or *not planned* in the last three
years — across the ten incumbents, read in full and clustered. Each cluster maps to a
requirement id in a layer's floor, or to a recorded "not planned, on purpose". The three
layer intents cite it the way every engine intent cites `competitor-open-issues.md`.

## Why now

Measured 2026-09-08 (GitHub search API, npm downloads API):

| Incumbent | Open issues | Weekly downloads | Reading |
| :-- | --: | --: | :-- |
| chalk | 0 | 439.8M | closes by policy; the backlog is the won't-fix list |
| picocolors | 8 | 202.5M | |
| ora | 0 | 79.8M | closes by policy |
| inquirer | 8 | 32.9M | |
| listr2 | 0 | 29.1M | closes by policy |
| cli-table3 | 13 | 23.3M | |
| log-update | 0 | 22.1M | closes by policy |
| clack | 60 | 20.4M | already read (research §9) |
| boxen | 5 | 20.2M | |
| ink | 14 | 5.8M | |

- **The "abandoned backlog" story does not hold for four of the ten.** Their trackers are
  empty because issues are closed and locked, not because nothing is wanted. The honest
  version: what they *decline* is the requirement list. A won't-fix from a maintainer of a
  440M-a-week package is the clearest possible statement of a gap nobody else will close.
- Without this pass the U-floor rests on clack's tracker and on our own reasoning. The
  engine's credibility came from the opposite: every row traceable to a citation.

## Affected users and systems

- `.sdlc/research/output-stack-open-issues.md` (new) and `competitor-landscape.md` (a
  second table for the stack: downloads, install size, spawn delta, dependency count).
- `scripts/fetch-competitor-issues.sh` extended to the ten repos and to closed-as-not-planned.
- The floors in `roundel`, `flagstaff`, `caique` intents gain citations per row; rows with
  no citation after this pass are demoted to "hypothesis" and measured before they lock.

## Constraints

1. Read in full, as before; no sampling. Record what could not be determined.
2. Closed issues are read only when closed as won't-fix / not-planned / locked; ordinary
   closures are noise.
3. Every cluster names an owner intent or a recorded non-goal. An orphan cluster fails the
   pass.

## Success criteria

- The research doc exists with a cluster table; every U-floor row cites at least one issue.
- `competitor-landscape.md` carries the stack's measured table with commands and dates.
- The three layer intents are re-issued with citations, and any row that lost its evidence
  is marked hypothesis.

## Open questions

- Whether sindresorhus's *discussions* (where some repos push feature talk) count as a
  tracker. Proposed: yes, read them, cite them as discussions.
