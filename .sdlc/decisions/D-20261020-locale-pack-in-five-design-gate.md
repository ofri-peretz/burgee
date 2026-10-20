---
id: D-20261020-locale-pack-in-five-design-gate
subject: '`locale-pack-in-five` sat at `review`. Is its design accepted, dropped, or accepted as restated, now that the case it targets has a measured median of 6 on main?'
taken: 'Accepted, with S3/R3 restated to the turns the product owns — by the batch-24 agent under the owner''s delegation of design gates (burgee-owner-delegates-tradeoffs, 2026-10-12), 2026-10-20'
date: '2026-10-20'
superseded_by: —
---

**Accepted. R1 and R2 are built in the same pull request as `localised-human-surfaces`'s
re-grounding, because they are small and sit in the files that intent owns (`check.ts`,
`locale.ts`, `locale-pack-schema.json`). R3's "median under 6" is restated: on the evidence below
the product can no longer reach the turn it measures.**

## The premise, measured before building

The intent was written on 2026-10-12 from five local runs: median 7, max 18. It said the remaining
turns went to *verifying what the schema says*: running `Intl.PluralRules`, reading
`check --help`, and searching the source for how to write a pack as a module.

That is not where the turns go on main today.

- **The series.** Every `Agent Evals` run on 2026-10-20 that executed the case: **34 readings,
  all passed. The median is 6 turns and the max is 8** (5 turns ×7, 6 ×22, 7 ×4, 8 ×1). No run was
  near the 12-turn cap. D-20261012-agent-eval-turn-budget's schema and check changes already took
  the case from median 7 / max 18 to here.
- **Where the sixth turn goes.** The runner printed a passing case's turn count and nothing else,
  so this pull request's first commit (`caseLines` in `scripts/run-evals.ts`) prints each call
  under a passing case too. One run on that commit, dispatched on the branch before any product
  change (run 39475810887, product identical to `main`), gave:

  ```
  ✓ locale-pack-from-schema — 6 turn(s)
    turn 1 Read: packages/burgee/src/locale-pack-schema.json
    turn 1 Read: packages/burgee/src/__fixtures__/locale-pack-de.json
    turn 2 Bash: ls -la evals/; ls -la evals/results/; ls packages/burgee/dist/cli.js
    turn 3 Write: evals/results/locale-pack-fr.mjs (1195 chars)
    turn 4 Bash: node packages/burgee/dist/cli.js check evals/results/locale-pack-fr.mjs --json
  ```

  The extra call is turn 2, a probe of the checkout: does the output directory exist, and does the
  CLI the prompt names exist. It does not read the schema, the source or `check`. In the same run, 9 of
  the 11 cases spend a call of their own on that probe (`ls` of `evals/results/` or of the CLI).
  `paratext-plugin-from-schema` is the one at 5, because its agent put the `ls` in the same Bash
  call as `check`. The pack passed its first `check`.
- **What the product can reach.** It cannot reach that probe. It happens before the agent has
  written anything. The prompt names `node packages/burgee/dist/cli.js` and
  `evals/results/`, and neither the schema nor `check` is consulted to answer it. The eval's
  prompt, cap and checks are not edited (D-20261012-agent-eval-turn-budget). The job already
  builds `dist/` first (D-20261007-eval-builds-first). So "median under 6" now measures whether the
  agent folds its probe into another call, and no change to burgee moves that.

## Why accept, and not drop

R1 and R2 do not move the median. They are still worth their bytes.

- **R1, `coverage`.** It makes `check` the verification of a pack, and not only its gate. A pack
  that passes says which ids it translates, which it leaves in English, and the plural forms
  written against the forms `Intl.PluralRules` needs. Before this, an author learned what a pack
  covered by diffing its ids against the schema's 92 by hand. The 2026-10-12 outlier spent its
  turns on exactly that kind of verification. That outlier is the tail (max 18), not the median.
  incumbent: yargs' `y18n` loads a locale file and reports nothing about its completeness.
- **R2, a whole module in the schema.** One run on 2026-10-12 spent 11 model turns searching the
  source for how a pack is written as a module. The schema showed the shape with `…`, and the one
  example is JSON. The description now holds a whole French module, three plural forms and all.
  `packages/burgee/src/locale-pack-schema.test.ts` runs `burgee check` on it, so the example cannot
  drift into one the check refuses.
- **Cost.** Both live on the lazy `check` path. `check.js` goes from 2,795 to 3,408 B (+613 B).
  `locale.js` gains one `export` keyword (+7 B). The schema JSON, which is data and not code, gains
  447 B. No entry in `weight.test.ts` moves (64 passed), because both modules are reached only by
  `await import()`. The core bundle (24,500 B ceiling, about 16 B of headroom, #1215) is untouched
  by construction: its closure follows `import` statements, never `await import()`.
- **Reversal.** Drop `coverage` from `CheckReport` and the module sentence from the generator's
  description. Neither is read by any machine surface. `--json` gains a key and loses none.

## R3, restated

- **Was:** the eval history median under 6, max under 12, from five local paid runs before and
  after.
- **Now:**
  - Every reading passes, and the max stays under 12.
  - No transcript spends a call on burgee: no read of burgee's source, no run of `Intl.PluralRules`
    or `check --help`, and no refused `check`. `caseLines` makes this checkable on every pull
    request's log.
  - The median is reported beside the bar and stays the aim. On 2026-10-20 its whole gap to 5 is
    the environment probe above.
- **The spec's rejected alternative, "raise the target to 7", stays rejected.** Nothing is raised.
  The criterion moves from a number the product cannot move to the calls the product owns.
- **"Before" is the CI series, not five local runs.** The series is 34 readings at no new spend,
  seven times the sample the spec asked for. The local `claude` login on the building machine is
  not this project's credential, so a local paid run would bill the wrong account.
- **"After" is this pull request's own `Agent Evals` runs, and every pull request's after it.**
  Their transcripts are now in the log.

## Spend

- **This decision:** one `workflow_dispatch` of `evals.yml` on the branch (11 cases, on the
  repository's subscription credential), plus this pull request's own runs.
- **For scale:** `main` ran the same job 40 times on 2026-10-20 for other pull requests.
- **Stop rule:** no further dispatch for this intent. Its readings come from runs that happen
  anyway.
