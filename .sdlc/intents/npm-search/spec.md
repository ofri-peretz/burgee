# Design — Findable in npm search: each description carries the words people type

Intent: [`intent.md`](./intent.md). **Status:** draft. Waiting for the owner's acceptance at the
Design→Build gate. Nothing below is built.

---

## The phrases

One primary phrase per package. It is the category name people type, taken from the
incumbents' own descriptions where possible (chalk: "Terminal string styling", ora: "Elegant
terminal spinner", c12: "Smart Config Loader"). There is also one incumbent phrase, for the
package the description already gives a drop-in path from.

| Package | Primary phrase | Incumbent phrase |
| --- | --- | --- |
| bellpull | child process | cross-spawn alternative |
| burgee | cli framework | commander alternative |
| caique | cli prompts | inquirer alternative |
| closeout | exit hook | signal-exit alternative |
| controlroom | tui framework | ink alternative |
| flagstaff | cli spinner | ora alternative |
| linegauge | string width | string-width alternative |
| oxmutate | mutation testing | stryker alternative |
| paratext | terminal hyperlinks | ansi-escapes alternative |
| roundel | terminal colors | chalk alternative |
| seniority | config loader | cosmiconfig alternative |

controlroom's primary is `tui framework` and not `terminal ui`. The opening carries both, but
`terminal ui` is predicted #240 and `tui framework` #14 (§ Predicted ranks). roundel's opening
uses the American "colors" because that is how people search. `colour` matches nothing, and
there is no stemming. The British spelling stays everywhere else.

## The new openings

Only the first words change. The rest of the first sentence, the dependency sentence and the
migration clause stay as they are, except that R5 rewords the migration clause.

| Package | Today's first sentence opens | Proposed |
| --- | --- | --- |
| bellpull | Runs a subprocess, resolves the executable … | **Child process execution:** runs a subprocess, resolves the executable … |
| burgee | A CLI framework built on one declaration: … | *(unchanged)* |
| caique | Prompts that are flags first: … | **CLI prompts** that are flags first: … |
| closeout | Runs every exit handler exactly once … | **Exit hook:** runs every exit handler exactly once … |
| controlroom | Keyboard-driven terminal screens, inline or full-screen, … | **Terminal UI (TUI) framework:** keyboard-driven terminal screens, inline or full-screen, … |
| flagstaff | Spinners, progress, boxes and tables on one terminal frame loop, … | **CLI spinner, progress bar,** boxes and tables on one terminal frame loop, … |
| linegauge | Measures, wraps, truncates and slices styled terminal text, … | **String width:** measures, wraps, truncates and slices styled terminal text, … |
| oxmutate | Mutation testing for JavaScript and TypeScript on the oxc engine, … | Mutation testing **tool** for JavaScript and TypeScript on the oxc engine, … |
| paratext | Hyperlinks, inline images, the window title, … | **Terminal hyperlinks,** inline images, the window title, … |
| roundel | Colour for a CLI: one output policy … | **Terminal colors** for a CLI: one output policy … |
| seniority | Resolves flags, environment variables, config files and defaults … | **Config loader:** resolves flags, environment variables, config files and defaults … |

The added words also cover phrases beyond each primary: `process execution` (execa's own
wording), `terminal ui` and `tui`, `progress bar`, and `mutation testing tool`, which is
predicted #9. Each opening was run through `named()` in `scripts/positioning-audit.ts`, and none
names an incumbent, so positioning R7 holds.

## Requirements

- **R1 — One phrase table.** `scripts/npm-search-rank.ts` exports
  `PHRASES: Record<string, { primary: string; incumbent: string }>` holding the table above.
  The lock and the measurement both read it, and nothing else lists the phrases.
- **R2 — The descriptions.** Each `packages/<name>/package.json` `description` opens as in the
  table above. Sentences two and three are untouched apart from R5.
- **R3 — The lock.** `scripts/npm-search-opening-lock.test.ts` fails when:
  - a published package (has a `version`, not `private`) has no `PHRASES` row, or a row names a
    package that is not published;
  - a description's first eight words do not contain the primary phrase's words, in order and
    adjacent. Words are the description lower-cased and split on anything that is not
    `[a-z0-9]`, so `Terminal UI (TUI) framework:` reads as `terminal ui tui framework`. No
    stemming is applied, because npm applies none: `hyperlink` does not match `hyperlinks`;
  - a primary phrase names an incumbent (`named()` from `positioning-audit.ts`). An incumbent
    in the opening is what positioning R7 forbids, and this is where it would come in.
- **R4 — The measurement.** `npx tsx scripts/npm-search-rank.ts` queries the registry search
  API once per phrase. Queries run one after another with a pause, and are retried when the API
  answers a burst with HTML instead of JSON. For each phrase it prints the package, the phrase,
  the rank (or `>250`) and whether the description the index returns equals the repository's.
  If they differ, the row says `stale` instead of a rank, because a stale index measures the
  old wording. `--check` exits 1 when any primary phrase is stale or outside the top 10. It uses
  `fetch` only and adds no dependency. It does not run in CI.
- **R5 — The migration clause names the word people search for.** "Drop-in paths for X, Y and
  Z." becomes "Drop-in alternative to X, Y and Z." The singular "Drop-in path for X." becomes
  the same. Five places parse the old wording, and each changes in the same PR:
  `positioning-lock.test.ts` (`MIGRATION`, its message, its fixtures), `readme-opening-lock.test.ts`
  (`LISTS`), and in `apps/docs-chassis/src/` `packages.ts`, `home-title.ts` and
  `package-home.tsx`. Only the new form is accepted, so the family cannot end up half on each.
  oxmutate's "A Stryker migration path." stays as it is: it migrates a command, not an import,
  and `COMMAND_MIGRATION` already reads it.
  *This amends the owner's 2026-10-09 voice decision. See intent open question 1.*
- **R6 — Release.** One patch changeset names every package whose description changed: all
  eleven with R5, ten without it, because burgee's opening already leads. The descriptions
  reach npm through the normal `chore(release)` PR, which a person merges.
- **R7 — The Maintain reading.** After that release, `npm view <pkg> description` matches for
  every package. Once `npm-search-rank.ts` shows no `stale` row, the reading is committed as
  `.sdlc/research/npm-search-rank-<date>.md`, next to the
  [2026-11-15 baseline](../../research/npm-search-rank-2026-11-15.md). That reading closes the
  intent's success criteria 3 and 4.

## Predicted ranks

Predicted from the per-phrase fit in the baseline reading (§ 3), using each package's weekly
downloads and the proposed description's length. A row marked "n < 8" has too few competing
descriptions to fit a prediction; there the competition is package names.

| Package | Primary phrase | Today | Predicted | Top 10 by wording? |
| --- | --- | --- | --- | --- |
| linegauge | string width | #6 | holds | yes, already there |
| closeout | exit hook | #8 | holds | yes, already there |
| roundel | terminal colors | >250 | #7 | yes |
| caique | cli prompts | >250 | #12–13 | borderline (needs ~1,000/wk; 618 today) |
| controlroom | tui framework | >250 | #14 | borderline |
| flagstaff | cli spinner | >250 | n < 8 | the reading decides |
| paratext | terminal hyperlinks | #138 | n < 8 | the reading decides |
| oxmutate | mutation testing | #48 | #44 | no: needs ~590k/wk |
| seniority | config loader | >250 | #59 | no: needs ~157k/wk |
| burgee | cli framework | #106 | #64 | no: needs ~115k/wk |
| bellpull | child process | >250 | #101 | no: needs ~4.6M/wk |

The last four miss because their phrase's top 10 is held by name matches and by packages with
100k+ weekly downloads, and no wording reaches that. Per the intent's success criterion 4, a
miss there opens an adoption intent. A miss in the first seven means this design was wrong.

The incumbent phrases have no prediction. "`<incumbent>` alternative" needs the word
"alternative" in the description, which no package has today. The only evidence is
lilconfig at #1 for `cosmiconfig alternative`, but its description is 44 characters long and
ours are around 250. R4 tracks the incumbent phrases and sets no target for them.

## Verification

- **The feedback loop:**
  `npx vitest run --config vitest.root.config.ts scripts/npm-search-opening-lock.test.ts`.
- **Proven red first.** The lock is committed and run against today's descriptions before any
  description changes. The expected result is 9 failures: bellpull, caique, closeout,
  controlroom, flagstaff, linegauge, paratext, roundel and seniority. burgee ("A CLI framework")
  and oxmutate ("Mutation testing") already lead with their phrases. The failing output goes
  into the PR body, then R2 turns it green.
- **R5's widened parsers are proven the same way.** The fixtures in `positioning-lock` and
  `readme-opening-lock` gain a case for "Drop-in alternative to …", which fails before the
  regex changes.
- **Unchanged neighbours:** `positioning-lock`, `readme-opening-lock`, `dependency-claim-lock`,
  `package-shape-lock` and the docs-chassis build all pass (`npm run ci:local`, then
  `npm run lint`).
- **The control** is R4's `--check`, run by hand after the release in R7, not in CI.

No `.qnt` model: nothing here has state, ordering or a deadline.

## Rejected alternatives

- **Leading with the phrase to gain rank.** Measured: position has no consistent effect (fit
  term −0.30 to +0.27 across five phrases, small beside downloads and length). The openings
  still lead with the phrase, because a person scanning results reads the first words. It is
  not done for the ranking.
- **Keywords.** burgee's `keywords` already hold `commander-alternative` and
  `yargs-alternative`, and it is >250 for both searches. Adding the primary phrase as a keyword
  would cost nothing, but there is no evidence it would move anything.
- **Shorter descriptions.** Length is a real lever: halving it gives about ×1.2 on the score.
  But the only text that could go is either the rest of the first sentence, which says what is
  different about the package, or the migration clause. That clause is what ranks us top 10
  for `string-width`, `cli-table3`, `colorette` and `exit-hook` today.
- **The incumbent in the opening ("A chalk alternative for …").** It would rank for the
  incumbent phrase, and positioning R7 forbids it. That rule is the owner's call, and R5 gets
  most of the benefit while keeping it.
- **A control band in `control-bands.yml`.** A band needs a stable baseline that the repository
  controls. A rank moves with every other package's downloads, and reading it needs the
  network. Committing a reading after each publish is enough.
- **A target below the top 10 for the four broad phrases.** That would set the bar to fit the
  prediction. The target stays where it says what matters. The prediction says in advance which
  misses come from adoption, so a breach is read correctly instead of being redefined away.

## Out of scope

- **READMEs, docs heroes and site copy.** The roundel docs index keeps "Colour for a CLI". This
  work changes the npm description and what renders from it, nothing else.
- **Search engines other than npm**, GitHub topics, and package names.
- **Growing downloads.** That is the lever for the four broad phrases, and adoption intents own
  it.
- **The ESLint and serverless families.** They are separate repositories, handled in parallel.
