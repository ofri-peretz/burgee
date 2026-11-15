# Intent — Findable in npm search: each description carries the words people type

**Status:** draft · **Opened:** 2026-11-15 · **Owner:** @ofri-peretz

---

## What is wanted

Someone setting up a CLI types what they need into npm search — "cli prompts", "terminal
colors", "exit hook" — and a burgee-family package is on the first page for it. That is how
most adopters find these packages: by searching at setup time, not through outreach. So npm
search rank is a main way people find them, and today most of the family is not on the first
page for the words that describe it.

Once this lands:

- each of the eleven published packages has a **primary search phrase**, written down in one
  file, and its npm `description` contains that phrase in the form people type it, within its
  first eight words;
- each package also has an **incumbent phrase** — "chalk alternative", "ora alternative" — for
  the package it gives a drop-in path from;
- a lock fails when a description stops leading with its phrase;
- a script measures each phrase's rank, and the first reading after the next publish is
  recorded.

## Why now

Measured 2026-11-15 with `https://registry.npmjs.org/-/v1/search?size=250&text=<phrase>`. The
full reading, and how it was taken, is
[`research/npm-search-rank-2026-11-15.md`](../../research/npm-search-rank-2026-11-15.md).

| Package | Phrase | Rank today |
| --- | --- | --- |
| linegauge | string width | #6 |
| closeout | exit hook | #8 |
| oxmutate | mutation testing | #48 |
| burgee | cli framework | #106 |
| bellpull | child process | >250 |
| caique | cli prompts | >250 |
| controlroom | terminal ui / tui framework | >250 |
| flagstaff | cli spinner | >250 |
| paratext | terminal hyperlinks | #138 |
| roundel | terminal colors | >250 |
| seniority | config loader | >250 |

Every "`<incumbent>` alternative" search is >250 for all eleven packages.

The reading also corrects the premise this intent was opened with. **Where the phrase sits in
the description has no measurable effect.** A least-squares fit over five phrases (n = 18–133
results each, R² 0.68–0.91) puts the score at about downloads^0.14 × description-length^−0.25,
and the position term's sign flips from phrase to phrase. burgee already opens "A CLI
framework" and is #106. What ranks is **the searched words in the description, in the exact
form typed, next to each other**. There is no stemming: paratext's description opens
"Hyperlinks", and it ranks #37 for `hyperlinks` but >250 for `hyperlink`. Keywords do not stand
in for this: burgee's `keywords` hold `commander-alternative`, and it is >250 for
"commander alternative".

Today's descriptions open with what the package does in our own words ("Runs a subprocess",
"Colour for a CLI", "Spinners, progress"). Those are not the words people search with.

## Affected users and systems

- **The eleven published `package.json` descriptions**: bellpull, burgee, caique, closeout,
  controlroom, flagstaff, linegauge, oxmutate, paratext, roundel, seniority. Each change
  reaches npm only through a release, so this needs one patch changeset.
- **Everything that renders a description**: the docs sites' home metadata and the llms.txt
  package map (`apps/docs-chassis/src/packages.ts`, `home-title.ts`, `package-home.tsx`). They
  re-render from the new text.
- **The description locks**: `positioning-lock` (R7, a description is three sentences),
  `readme-opening-lock` (reads the incumbents from the description) and
  `dependency-claim-lock` (the "Zero dependencies" sentence).

## Constraints

- **positioning R7 and R8 hold.** A description is still three sentences: what it does, the
  dependency fact, the migration clause. The first sentence names no incumbent. No sentence
  ranks the package against another. That rules out "chalk alternative" in the opening: the
  incumbent phrase has to come from the last sentence.
- **The dependency sentence does not change.** "Zero dependencies." stays only on packages
  whose manifest declares none, and "No dependency outside the burgee family." stays on the
  rest (`dependency-claim-lock`).
- **Change the opening, keep the rest.** Each opening gains the category words. The rest of the
  first sentence stays as it is, because the words after the phrase are the ones that say what
  this package does differently.
- **No keyword stuffing and no rename.** The name, and anything a search engine would treat as
  spam, are out.

## Success criteria

1. A lock fails when any published package's description lacks its primary phrase in its first
   eight words, or when a published package has no phrase. Shown failing on today's
   descriptions: 9 of 11 (burgee and oxmutate already lead with theirs).
2. `positioning-lock`, `readme-opening-lock` and `dependency-claim-lock` pass on the new
   descriptions, unchanged except where spec R5 deliberately widens the migration clause's
   wording.
3. After the next release, `npm view <pkg> description` matches the repository for every
   changed package.
4. **Maintain control:** `npx tsx scripts/npm-search-rank.ts --check` is run once the search
   index shows the new descriptions, and the reading is committed under `.sdlc/research/`.
   **Target: top 10 for each primary phrase.** The design-stage prediction (spec,
   § Predicted ranks) puts seven within reach by wording. closeout and linegauge are in the top
   10 today. roundel is predicted #7. caique and controlroom are predicted #12–14. flagstaff and
   paratext have fewer than eight competing descriptions, too few to fit a prediction, so the
   reading settles them. Four will not reach the top 10 at today's downloads:
   bellpull, burgee, oxmutate and seniority, whose phrases' top 10 is held by packages with
   100k+ weekly downloads. A miss on one of those four opens an adoption intent, not another
   rewording. A miss on any of the other seven is a design failure, and it reopens this intent.

## Open questions

1. **Spec R5 amends positioning R7's wording**, which the owner decided on 2026-10-09. It
   changes the migration clause from "Drop-in paths for X" to "Drop-in alternative to X", so
   that the "X alternative" searches have a word to match. Accepting the spec accepts R5.
   Striking R5 at acceptance leaves the incumbent phrases tracked but not targeted.
2. **No query volume.** npm publishes none, so the phrases come from reading the incumbents'
   own descriptions — the words their users found them with — not from a count of searches.
3. **Narrower phrases for the four predicted misses.** `process execution` (#33 predicted),
   `cli toolkit` (#18), `mutation testing tool` (#9) and `config resolution` (#15) are
   reachable. The spec keeps the broader category phrase as primary for those four because it
   is what people type. Swapping in the narrower phrase is a one-line change to the phrase
   table, if the owner prefers a reachable target to the right one.
