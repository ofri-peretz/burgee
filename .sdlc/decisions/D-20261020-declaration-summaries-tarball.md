---
id: D-20261020-declaration-summaries-tarball
subject: 'declaration-summaries R4: where do the tarball baselines go once declarations carry summaries?'
taken: 'Taken — on the owner''s delegation of 2026-10-12 over budgets and trade-offs'
date: '2026-10-20'
superseded_by: —
---

**Every recorded figure the packs fell under follows them down, dimension by dimension, to the
pack of the tree this PR builds (`npm pack --dry-run --json`). Nothing is raised.** Lowering is the
direction of `.sdlc/bands/artifact-size-baseline.json` that needs no permission. It is recorded
here because R4 asks for a dated decision, and because it lands in the same PR as the rule, not
after the next release as the spec first said: the release packs this same tree, so waiting would
record the same figure later.

**The measurement** (`node scripts/declaration-summaries.mts --measure`, a clean build of `main` at
`326907ec` with this PR's READMEs, packed as built and with the rule applied):

| package | gzipped before | after | change | unpacked before | after | change |
| :-- | --: | --: | --: | --: | --: | --: |
| bellpull | 36,931 | 29,647 | −19.7% | 116,742 | 96,158 | −17.6% |
| burgee | 275,661 | 260,048 | **−5.7%** | 1,044,708 | 1,000,016 | −4.3% |
| caique | 78,194 | 71,767 | −8.2% | 269,799 | 252,671 | −6.3% |
| closeout | 40,962 | 33,189 | −19.0% | 130,162 | 107,826 | −17.2% |
| controlroom | 82,408 | 81,228 | −1.4% | 331,913 | 328,812 | −0.9% |
| flagstaff | 69,898 | 67,387 | −3.6% | 241,817 | 235,315 | −2.7% |
| linegauge | 34,035 | 31,747 | −6.7% | 111,644 | 105,598 | −5.4% |
| paratext | 37,984 | 32,193 | −15.2% | 119,655 | 102,845 | −14.0% |
| roundel | 39,448 | 34,129 | −13.5% | 113,988 | 99,734 | −12.5% |
| seniority | 65,854 | 59,937 | −9.0% | 233,555 | 218,282 | −6.5% |

burgee saves 5.7% gzipped, above the intent's 5% kill switch, so R2–R4 proceed. In total the ten
packs fall by 60,103 B gzipped (−7.9%) and 166,726 B unpacked (−6.1%).

**What an install pays.** burgee's installed tree, the family packages it depends on included
(`installedBytes`, the walk `benchmarks/docs.test.ts` holds `comparison.mdx` to), falls from
1,768,523 to 1,645,338 B: **1727 -> 1607 KB, −7.0%**. `comparison.mdx` states the new figure.

**The figures written.** Where the new pack is below the recorded figure, the figure becomes the
pack, read after `weight:converge` rewrote the foundation READMEs' weight lines (which moved
bellpull's unpacked, paratext's and seniority's gzipped by a byte or two from the table):
bellpull 29,647 / 96,157; burgee 260,048 / 1,000,016; caique 71,767 gzipped (its unpacked
252,671 is above the recorded 246,099, so that one stays); closeout 33,189 / 107,826; linegauge
31,747 gzipped (unpacked stays 103,186); paratext 32,192 / 102,845; roundel 36,074 / 106,490 (written after merging #1177, whose supports-color drop-in had raised roundel's figure to 41,319 / 120,744 on `main`; the table's roundel row predates it);
seniority 59,935 / 218,282. controlroom and flagstaff still pack above their recorded figures,
from growth under the 10% allowance, so theirs stay where they are.

**What reverting the rule would trip.** The R3 lock fails for all ten packages. `check:artifacts`
fails for bellpull, closeout, paratext and roundel, whose saving exceeds the 10% allowance; for
burgee (5.7%) and the rest it would not, so R3 is the check that holds those.

**Reversal.** Remove the summariser call from `strip-comments.mjs`; this file's figures then
re-record upward by a decision of their own (D-20261012-declarations-carry-summaries, *Reversal*).
