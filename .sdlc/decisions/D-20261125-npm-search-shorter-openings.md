---
id: D-20261125-npm-search-shorter-openings
subject: 'npm-search: shorten the first sentence of caique, controlroom, roundel and flagstaff to the phrase plus a few words, lifting the "change the opening, keep the rest" constraint for those four?'
taken: 'Proposed in the building session, 2026-11-25, on the coordinator''s relay of the owner''s "getting all of these to done"; the owner decides on the PR'
date: '2026-11-25'
superseded_by: —
---

**Proposed: the four within-reach misses keep their primary phrase and lose the rest of their
first sentence.** The intent's constraint "Change the opening, keep the rest" is lifted for these
four only. The dependency sentence and the migration clause are unchanged, so positioning R7 and
R8, `dependency-claim-lock` and `readme-opening-lock` hold as they are, and every incumbent stays
listed.

| Package | Phrase | Description length before | After |
| --- | --- | ---: | ---: |
| caique | cli prompts | 229 | 121 |
| controlroom | tui framework | 251 | 119 |
| roundel | terminal colors | 253 | 137 |
| flagstaff | cli spinner | 250 | 148 |

**Why.** The one-week reading
([`research/npm-search-rank-2026-11-25.md`](../research/npm-search-rank-2026-11-25.md)) cleared
the lag hypothesis: these four sat at #16, #21, #21 and #35 for a week with the phrase already in
their first eight words. What separates them from the top 10 is length. The baseline fit put the
score at about description-length^−0.25. On 2026-11-25
(`https://registry.npmjs.org/-/v1/search?size=40&text=<phrase>`), every top-10 description for
the four phrases was 16 to 105 characters long, and ours were 229 to 253. Within one query, at
similar weekly downloads, a shorter description that holds the same phrase scores higher: for
`cli prompts`, `is-affirmative` (101 characters, 489 a week) scored 149.4 against
`@cli-prompts/multiline` (203 characters, 491 a week) at 121.7.

**What it costs.** The words after the phrase, which said what each package does differently
(caique's non-TTY error naming the flag, controlroom's `--json` projection and optional react
peers, roundel's nine tokens and contrast-checked theme, flagstaff's single frame loop), leave the
npm description. They stay in each README and docs home, which say them at length. The registry
truncates nothing at this length, and the docs pages re-render from the new text
(`scripts/sync-package-docs.ts`).

**What would prove it wrong.** The reading one week after the release that publishes these
descriptions. If any of the four is still outside the top 10, length was not the lever, and the
next step is the adoption intent, not a shorter description: there is no first sentence shorter
than the phrase plus a clause.
