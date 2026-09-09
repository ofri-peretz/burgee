# Intent — What we improve: the output stack's research pass

> Stage 1 artifact. Child of [`cli-output-stack`](../cli-output-stack/intent.md). The
> engine's floor came from reading 329 open issues across five trackers. The three new
> layers have no equivalent yet; this intent produces it, and the floor rows for roundel,
> flagstaff and caique come from here, not from taste.

**Status:** review · **Opened:** 2026-09-08 · **Owner:** @ofri-peretz · **Corrected from `shipped`
2026-09-09** — the doc landed, the intent did not; see [Verified against `main`](#verified-against-main--2026-09-09). The doc is
[`../../research/output-stack-open-issues.md`](../../research/output-stack-open-issues.md)

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
| chalk | 0 | 439.8M | 0 open after the v6.0.0 release sweep (2026-07); 32 closed in 3y read, 20 declined |
| picocolors | 8 | 202.5M | |
| ora | 0 | 79.8M | 34 closed in 3y read, 17 declined |
| inquirer | 8 | 32.9M | |
| listr2 | 0 | 29.1M | closes fixes, not by policy: 37 of 45 closed were fixes, 8 declined |
| cli-table3 | 13 | 23.3M | |
| log-update | 0 | 22.1M | 11 closed in 3y read, 3 declined |
| clack | 60 | 20.4M | already read (research §9) |
| boxen | 5 | 20.2M | |
| ink | 14 | 5.8M | |

- **The "abandoned backlog" story does not hold for four of the ten, and "closes by policy"
  was itself an over-statement.** The pass (2026-09-08) found chalk's zero is a release sweep and
  listr2 closes fixes; what is true of all four is that the *declined* issues are the requirement
  list. The honest
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

## Verified against `main` — 2026-09-09

**Status corrected from `shipped` to `review`.** One of three criteria met. `shipped` was the
loudest claim in this file and it was not earned; the research doc is excellent and the intent
around it overstated what the doc closed.

- **The research doc exists with a cluster table; every U-floor row cites at least one issue** —
  **not met, by one row.** `.sdlc/research/output-stack-open-issues.md` is real and substantial
  (21 clusters; 108 open, 122 closed, 48 declined across ten trackers) and carries a "Citations
  for the U floor" table. **U12 cites no issue** — the table itself says *"no issue; supported
  only by the download spread in the landscape table … hypothesis — measure before lock"*. The
  doc is honest; the criterion says *every* row, and one row has nothing.
- **`competitor-landscape.md` carries the measured table with commands and dates** — **met.**
  §7, "Measured 2026-09-08": ten packages with version, downloads, dependency count, unpacked
  size, stars, open and declined counts, above a fenced block of the exact `npm view`,
  `api.npmjs.org` and `gh api graphql` commands that produced them. It declares two columns
  (installed closure, spawn delta) explicitly **not measured**, which is the right kind of
  honesty and is why they are not counted here.
- **The three layer intents are re-issued with citations, and any row that lost its evidence is
  marked hypothesis** — **not met.** `roundel/intent.md`, `flagstaff/intent.md` and
  `caique/intent.md` reference `output-stack-open-issues.md` zero times each; only
  `roundel/design.md` and `flagstaff/design.md` cite it, and `caique` cites it nowhere at all.
  None of the six files contains the word *hypothesis*. The citations landed in the research
  doc's own U-table rather than being pushed back into the intents the criterion names.

The remaining work is small and specific: cite an issue for U12 or mark U12 a hypothesis in the
U-floor table, and push the citations into the three layer intents — `caique` first, which cites
the research nowhere.

## Open questions

- Whether sindresorhus's *discussions* (where some repos push feature talk) count as a
  tracker. Proposed: yes, read them, cite them as discussions.
