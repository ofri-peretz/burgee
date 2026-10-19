# Intent — What we improve: the output stack's research pass

> Stage 1 artifact. Child of [`cli-output-stack`](../cli-output-stack/intent.md). The
> engine's floor came from reading 329 open issues across five trackers. The three new
> layers have no equivalent yet; this intent produces it, and the floor rows for roundel,
> flagstaff and caique come from here, not from taste.

**Status:** review · **Opened:** 2026-09-08 · **Owner:** @ofri-peretz · **Corrected from `shipped`
2026-09-09** — the doc landed, the intent did not; see [Verified against `main`](#verified-against-main--2026-09-09). The doc is
[`../../research/output-stack-open-issues.md`](../../research/output-stack-open-issues.md)

**Restated:** 2026-10-18 — see [§ Restated 2026-10-18](#restated-2026-10-18)

---

## Restated 2026-10-18

**The research pass is complete and S1 is restated to the verdict rule the design already used; caique's evidence table was never written — REMAINING: S3.**

Audited read-only against `main` at `1013b65db5` (2026-10-18). This is a documents-only
intent: nothing here is held by a test, and each row is held by a document at a path on
`main`, named in the table. IDs: S1–S3 are the three [Success criteria](#success-criteria)
bullets in order; R1–R7 are [`spec.md`](./spec.md)'s requirements.

| ID | promised | on main | check | disposition |
| :-- | :-- | :-- | :-- | :-- |
| S1 | the research doc exists with a cluster table; every U-floor row cites at least one issue | 21 clusters; 13 U rows, 9 cited, 2 partial (U1, U7), 2 marked hypothesis (U9, U12) | `.sdlc/research/output-stack-open-issues.md` § "Citations for the U floor" | restated (held) |
| S2 | `competitor-landscape.md` carries the stack's measured table with commands and dates | yes | `.sdlc/research/competitor-landscape.md` § "7. The output stack" | held |
| S3 | the three layer intents are re-issued with citations, and an uncited row is marked hypothesis | roundel and flagstaff, in their designs; caique not at all | `.sdlc/intents/roundel/spec.md` § "Evidence", `.sdlc/intents/flagstaff/spec.md` § "Evidence" | restated; caique remaining |
| R1 | every open issue in the ten trackers read in full via the REST API, paginated, pull requests dropped | yes | `scripts/fetch-competitor-issues.sh stack` and its 14 snapshots in `.sdlc/research/issues/output-stack/` | held |
| R2 | for chalk, ora, log-update and listr2, issues closed in three years read with their closing comments | yes | the same script's declined filter (`not_planned`, a wontfix-style label, or locked); the counts in [Why now](#why-now) | held |
| R3 | discussions read as summaries | yes (D-071) | 29 `D#` discussion citations in the research doc | held |
| R4 | every cluster names an owner; an orphan fails the pass | yes: 21 clusters, 21 owner lines | the research doc, §§ 1–21 | held |
| R5 | a citations table for U1–U13; an uncited row reads "hypothesis — measure before lock" | yes | the research doc § "Citations for the U floor" | held |
| R6 | the measured table of ten incumbents with commands and date; unmeasured cells say so | yes | `.sdlc/research/competitor-landscape.md` § "7. The output stack" | held |
| R7 | what could not be determined is recorded, including corrections to the intent's premises | yes | the research doc § "What could not be determined" | held |

What changed, and why:

- **S1 is restated to the rule the design already set.** Spec R5 says an uncited row "reads
  'hypothesis — measure before lock'", and its Verification records "U9 and U12 marked
  hypothesis" as the pass's result. The intent's "every row cites" asked for evidence the
  pass could not find: U12 has no issue behind it, and the research doc says so rather than
  inventing one. S1 now reads: *every U-floor row carries a verdict — cited, partial, or
  hypothesis — measure before lock.* That holds for all 13 rows. Both hypothesis rows have
  since been settled upstream, by measurement, not by citation. The umbrella's status table
  in [`burgee/spec.md`](../burgee/spec.md) marks U9 **Built** under
  D-20261009-burgee-1-0-evidence (three recorded runs of the authoring eval at 10 of 10). It
  marks U12 **Built** under D-20261009-burgee-u12-1-0 (restated to its engineering half). The
  research doc's two "hypothesis" cells are therefore stale against the umbrella. That is a
  correction for the research doc's next refresh. It does not reopen this intent, because the
  verdict rule held when the pass was done.
- **S3 is restated to where the citations actually landed, with caique remaining.** This
  intent's own design moved the re-issue out of scope ("done in each layer's next design
  revision"). roundel and flagstaff did it in their `spec.md`, not their `intent.md`. Each has
  an `### Evidence` table keyed by requirement, citing this research doc, and marks uncited
  rows hypothesis: roundel R5 and R11, flagstaff R4 and R11. S3 is restated to *each layer's
  design carries an evidence table citing this research, with uncited rows marked
  hypothesis*. It holds for roundel and flagstaff.
- **caique has no such table, so its half of S3 is remaining.** Three things look close and
  are not:
  - `caique/intent.md` cites clack issues inline (#167, #408, #533, #573, #585) in its
    wants and constraints. These are citations, but not an evidence table per requirement.
  - `caique/issues.md` is a generated demand table (`scripts/mine-issues.ts`, 2026-09-14)
    for inquirer and clack. It is not keyed to caique's requirements, and it reports that
    caique carries 0 citations.
  - `packages/compat-oracle/baseline/clack.json`, `inquirer-core.json` and
    `inquirer-prompts.json` grade the façades against the incumbents' own suites. That is U11
    evidence, not tracker citations.

  No intent owns the move: `caique`'s open items are its R1 `promptFor` API, its non-TTY
  benchmark and its PTY test, and none of them is an evidence table. The remaining work is a
  `### Evidence` table in `caique/spec.md` of the same shape as roundel's and flagstaff's.

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

- ~~The research doc exists with a cluster table; every U-floor row cites at least one issue.~~
  **Restated 2026-10-18 (S1):** the research doc exists with a cluster table, and every U-floor
  row carries a verdict — cited, partial, or *hypothesis — measure before lock* (spec R5).
  Held by `.sdlc/research/output-stack-open-issues.md` § "Citations for the U floor".
- `competitor-landscape.md` carries the stack's measured table with commands and dates.
  **2026-10-18 (S2): held** by `.sdlc/research/competitor-landscape.md` § "7. The output stack".
- ~~The three layer intents are re-issued with citations, and any row that lost its evidence
  is marked hypothesis.~~ **Restated 2026-10-18 (S3):** each layer's design carries an
  evidence table citing the research, with uncited rows marked hypothesis. Held for roundel
  and flagstaff (`spec.md` § "Evidence"); **remaining** for caique, which cites the research
  nowhere.

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
  `roundel/spec.md` and `flagstaff/spec.md` cite it, and `caique` cites it nowhere at all.
  None of the six files contains the word *hypothesis*. The citations landed in the research
  doc's own U-table rather than being pushed back into the intents the criterion names.

The remaining work is small and specific: cite an issue for U12 or mark U12 a hypothesis in the
U-floor table, and push the citations into the three layer intents — `caique` first, which cites
the research nowhere.

## Open questions

- Whether sindresorhus's *discussions* **Decided 2026-09-20 → D-071.** (where some repos push feature talk) count as a
  tracker. Proposed: yes, read them, cite them as discussions.
