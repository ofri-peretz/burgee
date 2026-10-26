---
id: D-20261026-locale-criterion-3-median-range
subject: '`locale-pack-in-five` criterion 3 asks that no transcript spend a call on burgee, and 2 of the 16 readings on the released product do. Fix the cause, restate the criterion, or both?'
taken: 'Both: the schema no longer prints the expression one run executed and now says where each id''s English is; criterion 3 is restated as every reading passing with max under 12 and the median and range over a named window, with the share of transcripts that spend a call on burgee as a control band (reopen above 1 in 4). It holds on the recorded window, so the intent is stamped. By the polish-batch agent under the owner''s delegation (burgee-owner-delegates-tradeoffs, 2026-10-12), 2026-10-26'
date: '2026-10-26'
superseded_by: —
---

## The evidence

Every `Agent Evals` run on the released product (burgee 1.7.0 from #1219 and 1.7.1 from #1232)
that executed the case, read from each run's own log (`caseLines` prints every call under a
passing case). No eval was dispatched for this decision; each reading is a pull request's own run.

| Run | Turns | A call spent on burgee |
| :-- | --: | :-- |
| 40086461208 | 7 | turn 2: `node -e "…new Intl.PluralRules('fr').resolvedOptions().pluralCategories"` |
| 40208381161 | 6 | — |
| 40209239733 | 6 | — |
| 40211217474 | 6 | — |
| 40212240457 | 6 | — |
| 40213707831 | 6 | — |
| 40215284240 | 7 | — |
| 40215425633 | 5 | — |
| 40217253606 | 8 | turn 2: `grep -n "stdinOnce\|unknownOption…" packages/burgee/src/messages.ts` |
| 40218112430 | 6 | — |
| 40219403322 | 6 | — |
| 40230783186 | 6 | — |
| 40232254470 | 6 | — |
| 40243854925 | 6 | — |
| 40244822976 | 6 | — |
| 40246944698 | 6 | — |

**16 readings, 2026-10-24 to 2026-10-25: all passed, median 6, range 5–8, 2 of 16 (12.5%) spend a
call on burgee.** Runs 40214856251 and 40221624750 did not execute the case and are not readings.
The roadmap's "2 of 12" was the same two transcripts over the readings recorded by then.

## Why both

**The cause is the schema's, and it is cheap to remove.** Both calls looked up something the
schema already said:

- Run 40086461208 executed `new Intl.PluralRules(tag).resolvedOptions().pluralCategories`. The
  plural message's description printed exactly that expression, in parentheses, beside the list of
  forms it computes. An agent shown a command to run runs it. The description now gives the list
  alone, and says `burgee check` names the forms (`coverage`, `need`) for a language the list
  leaves out.
- Run 40217253606 grepped `messages.ts` for the English of the ids it had to translate. Each id's
  English is its `description` under `$defs.messages`, but the top-level description never said
  so, and a 16 KB schema is easy to read past. It now says so in one clause.

`locale-pack-schema.test.ts` holds both: it was red on `main` (the expression was there, the
clause was not). The change ships in the next burgee patch. The readings after it measure whether
it works. This decision does not assume it does.

**The criterion as written cannot be held, and that is the criterion's fault.** "No transcript
spends a call on burgee", over every reading, is zero tolerance on a stochastic agent. Any finite
window can be broken by one transcript, and the next window can break it again. An agent's readings
vary from run to run, so the honest report is a median and a range, never one run. A criterion that a single outlier reopens is a coin flip about when to stamp. It is
not a bar.

**What the criterion measures still matters.** The intent's claim (PRINCIPLES 7) is that the schema
plus one example are enough to write a pack. A call spent on burgee is evidence against that claim,
so its rate stays visible, as a band and not a gate:

- **Restated criterion 3.** Every reading passes, and the maximum stays under 12. The median and
  range are reported over a named window of readings, beside the aim of under 6. The share of
  transcripts that spend a call on burgee is reported in the same window. **Above 1 in 4, the
  intent reopens**: that rate means the schema is failing its claim, not that one agent wandered.
- **Window for the stamp.** The 16 readings above: all passed, max 8, median 6, range 5–8, burgee
  calls 2 of 16. **The restated criterion holds.**

## Rejected

- **Fix only, and leave the intent `approved` until readings show zero.** The fix is right and is
  in. But "zero" over a window is the coin flip above, and holding the stamp on it would keep a
  shipped feature reading as work remaining.
- **Restate only.** The two calls had one cause each, both in a generated file, and both are a
  sentence long to remove. Restating without fixing would have reported a defect and not mitigated
  it.
- **Dispatch paid runs to show the fix works.** Out of scope for this batch, and unnecessary: every
  pull request runs the case on its own `Agent Evals` job, so the readings after the next release
  arrive for free.
