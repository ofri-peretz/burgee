---
id: D-20261009-b1-totals-and-explain
subject: 'B1''s agent claims are measured as totals over every task-run, and `--schema` and the unknown-command hint name `--explain`'
taken: Accepted
date: '2026-10-09'
superseded_by: —
---

**The owner accepted both defaults of D-20261009-b1-two-turns on 2026-10-09. A: `agent-tokens-40pct`
(≤ 0.6) and `agent-turns-30pct` (≤ 0.7) are now measured as burgee's tokens and turns summed
over all 25 task-runs, divided by commander's. They were a ratio of pooled medians. The 0.8
success-rate floor, the tasks, their checks and the allowlist do not change. B: a native
program's `--schema` document and the unknown-command hint both name `--explain` for "where did
this value come from".** The README claim table and `/docs/benchmarks` say that the measure
changed, and when.

This supersedes two earlier answers:

- D-20261009-b1-two-turns: its default ("the claims, the tasks and the floor stay as they are")
  and the status of its proposals P2 and P3, which are now done. Its arithmetic and its P1
  recommendation still stand.
- D-20260930-failures-teach-recovery, the section "What `--schema` says about it: Nothing new, on
  purpose". Its rules 1 to 5 still stand. Rule 4 holds here too: the new text names the flag,
  never `<program> --explain`.

## A. Why the claims' measure changes

A median of 25 task-runs at five runs a task is decided by which side of 13 a handful of runs
land on. burgee's pooled median is 3 turns on every run since #881. commander's is bimodal, 4 or
6, depending on how many of its 25 agents guess `demo config get user.name` straight away. So
the claims were a coin flip on the incumbent's luck: the same build read 0.5 or 0.75 for turns,
and 0.49 or 0.75 for tokens. The median also cannot see where burgee wins. On
recover-failure it takes 3 turns to commander's 8 to 16, and on diagnose-provenance about 9 to
commander's 11. A total counts every turn and every token each CLI cost.

The intent's own words are "≥40% fewer tokens and ≥30% fewer turns to complete a fixed task set"
(`.sdlc/intents/burgee/intent.md`). A total over the task set is that sentence measured.

**The change is not the flattering one on the newest run.** On `e6cff20` the old measure reads
0.492 tokens and 0.5 turns, so both are met. The new one reads 0.699 tokens (not met) and 0.677
turns (met).

### What it does to the 12 landed CI runs

These are the 12 B1 runs on main since #881 installs the demo as `demo`. Totals are summed from
each document's per-task detail (`<task>.turns`, `<task>.tokens`); none of these documents
carries the total records yet. n = 25 a side on every run. The ratio is
`(Σ burgee / n) ÷ (Σ commander / n)`, which equals Σ burgee ÷ Σ commander when both sides
measured the same number of runs.

| run | turns burgee / commander | **turns, totals** | tokens burgee / commander | **tokens, totals** | median tokens / turns (old) |
| :-- | :-- | --: | :-- | --: | :-- |
| ba8a89c | 106 / 151 | 0.702 | 2,194,413 / 3,269,246 | 0.671 | 0.995 / 1.0 |
| 98c355c | 107 / 179 | 0.598 | 2,151,421 / 3,768,161 | 0.571 | 0.495 / 0.5 |
| d33ae03 | 104 / 173 | 0.601 | 2,130,189 / 3,703,727 | 0.575 | 0.491 / 0.5 |
| e641aa3 | 106 / 168 | 0.631 | 2,319,709 / 3,692,662 | 0.628 | 0.493 / 0.5 |
| 367cefb | 111 / 158 | 0.703 | 2,398,861 / 3,466,218 | 0.692 | 0.747 / 0.75 |
| f29f159 | 101 / 173 | 0.584 | 2,067,642 / 3,768,694 | 0.549 | 0.493 / 0.5 |
| 689c403 | 115 / 164 | 0.701 | 2,317,925 / 3,605,485 | 0.643 | 0.493 / 0.5 |
| a0aa992 | 106 / 175 | 0.606 | 2,250,330 / 3,779,888 | 0.595 | 0.492 / 0.5 |
| fe4c90f | 102 / 175 | 0.583 | 2,194,160 / 3,857,547 | 0.569 | 0.493 / 0.5 |
| 8d601e7 | 105 / 160 | 0.656 | 2,245,220 / 3,518,302 | 0.638 | 0.494 / 0.5 |
| 04e48de | 107 / 162 | 0.660 | 2,180,437 / 3,539,357 | 0.616 | 0.746 / 0.75 |
| e6cff20 | 105 / 155 | 0.677 | 2,272,739 / 3,252,619 | 0.699 | 0.492 / 0.5 |

Turns (≤ 0.7) are met on 9 of 12 runs, and the 3 misses are 0.701 to 0.703. Tokens (≤ 0.6) are
met on 5 of 12. The totals move a quarter to a third as far between runs as the medians did
(turns 0.583 to 0.703 against 0.5 to 1.0; tokens 0.549 to 0.699 against 0.491 to 0.995). One
lucky commander agent shifts a sum by one run's worth, not the whole statistic.

### How it is recorded

- `benchmarks/axes/agent.ts` emits `tokens-total` and `turns-total` per variant, and
  `tokens-total-ratio` and `turns-total-ratio` for `burgee ÷ commander`. A run that reported no
  usage is left out of the sums. The ratio is taken per measured run, so a lost run cannot shrink
  one side's total and flatter it.
- The median records (`tokens-per-task`, `turns-per-task` and their `-ratio`s) are still emitted,
  so the series keeps its history. Their notes now say the claims read the totals.
- `benchmarks/claims.ts` points both claims at the total-ratio records. The ids stay, because
  they key every results document that has settled them.
- **The bands do not move.** `agent-tokens-per-task` and `agent-turns-per-task` watch burgee's own
  per-task medians, which this does not change, and no band ever read the ratio.
- **The claim-table lock is unchanged, and it is why the turns row is not ✅ yet.** A ✅ must be
  satisfied by the newest CI document that measures the claim's record. No landed document
  carries `turns-total-ratio`, so the README marks that row **unmeasured** until the first B1 run
  on main after this merges. The figures beside it are the per-task detail, summed. The tokens row
  is ❌ on `e6cff20` (0.699).
- `/docs/benchmarks` is generated from the published document (`2026-10-09.json`, the `367cefb`
  run), which was settled on the medians. The generator now adds a note under the claims table
  whenever a published agent claim was settled from a record other than the one `claims.ts` names.
  The note gives that run's totals, summed from its detail: 0.692 tokens, 0.703 turns.

## B. Why `--schema` names `--explain` now

diagnose-provenance asks where the greeting comes from. The transcripts of all 12 readings
(`gh run download <run> -n b1-transcripts`, 60 burgee runs) show the usual path:

1. `demo grace`: an unknown command. The hint says `run --schema …` and lists `greet <name>`.
2. `demo greet grace`.
3. `demo --schema`: this shows `greeting`'s default and its env name, `DEMO_GREETING`.
4. Then 3 to 8 turns of `echo $DEMO_GREETING`, `printenv`, `env | grep`, and
   `DEMO_GREETING=Hey demo …`. The allowlist refuses most of them.

56 of 60 runs read `--schema`. The few that reached `--explain` found it in `greet --help`. The
document said what the sources were but not how to ask which one a run used. D-20260930 kept
framework surfaces out of the document so `./yargs` would not pay for them. That still holds,
because the pointer is added by the native `--schema` surface (`schema-surface.ts`, a lazy
chunk), not by `schemaOf`:

- the program document carries `"explain":"--explain <option> on a command says where its value came from: default, env, config or flag"`,
  just before `commands`, both in full and in the over-budget summary;
- the unknown-command hint, when nothing is near, reads `run --schema for every command and
  option as JSON, in one call; --explain <option> says where a value came from`;
- one command's schema, and `--schema` from `burgee/commander` and `burgee/yargs`, are unchanged.
  The façades do not parse `--explain`, so naming it there would advertise a flag they refuse.
  `machine-json.test.ts` still holds the three front ends byte for byte on everything else;
- `burgee/program-schema.json` describes the field.

Bytes: the core bundle (24,221 B), `./commander` (60,895 B) and `./yargs` (108,239 B) do not
move. The demo's `--schema` grows from 1,573 B to 1,678 B (+105 B, about 25 tokens a read). The
`agent-schema-bytes` band is flat at 1,573, so this step will show on it once, by design.

### Estimate, from the transcripts

The model: a burgee diagnose-provenance run that reads `--schema` as its k-th call then runs
`greet grace --explain greeting` and answers. That is k + 2 turns, or the run's own count if that
was already lower. Marginal tokens per turn are 19,021, a least-squares fit over the 60 runs.
This counts only the `--schema` pointer. The hint (step 1 above) could save more, but whether an
agent skips `greet grace` after reading it is a guess, so it is given as an upper bound.

| run | diagnose-provenance turns, now → with B | turns saved | turns, totals → with B | tokens, totals → with B |
| :-- | :-- | --: | :-- | :-- |
| ba8a89c | 13→8 6→5 8→5 7→6 7→5 | 12 | 0.702 → 0.623 | 0.671 → 0.601 |
| 98c355c | 9→5 5 11→8 12→9 9 | 10 | 0.598 → 0.542 | 0.571 → 0.520 |
| d33ae03 | 7→5 7→5 12→9 9→5 9→8 | 12 | 0.601 → 0.532 | 0.575 → 0.514 |
| e641aa3 | 12→8 10→7 5 12→7 11→7 | 16 | 0.631 → 0.536 | 0.628 → 0.546 |
| 367cefb | 10→8 12→10 8 12→7 7→5 | 11 | 0.703 → 0.633 | 0.692 → 0.632 |
| f29f159 | 9→5 5 10→8 10→7 10→5 | 14 | 0.584 → 0.503 | 0.549 → 0.478 |
| 689c403 | 8→5 14→5 5 12→9 13→12 | 16 | 0.701 → 0.604 | 0.643 → 0.558 |
| a0aa992 | 11→7 8→5 11→7 10→5 10→6 | 20 | 0.606 → 0.491 | 0.595 → 0.495 |
| fe4c90f | 8→7 8→5 10→9 7→5 7→5 | 9 | 0.583 → 0.531 | 0.569 → 0.524 |
| 8d601e7 | 8→6 11→9 11→9 8→5 11→8 | 12 | 0.656 → 0.581 | 0.638 → 0.573 |
| 04e48de | 8→5 9→8 13→9 8→5 11→9 | 13 | 0.660 → 0.580 | 0.616 → 0.546 |
| e6cff20 | 7→5 10→8 11→7 11→7 11→7 | 16 | 0.677 → 0.574 | 0.699 → 0.605 |

That is 161 turns over 12 readings, **about 13.4 turns a reading**. D-20261009-b1-two-turns
estimated 21 with a looser model. With the hint counted as well, the upper bound is 24.3. On
this estimate turns meet ≤ 0.7 on all 12 runs, and tokens meet ≤ 0.6 on 10 of 12; `367cefb`
(0.632) and `e6cff20` (0.605) still miss. **Nothing here is a measurement.** B1 runs on every
push to main, and those runs decide both claims. The `bench:agent` label was not used.
