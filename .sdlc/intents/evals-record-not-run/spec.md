# Design — An agent run that never started is recorded as not run

Intent: [`intent.md`](./intent.md). **Status:** approved — accepted under the owner's 2026-10-12 delegation.

Grounded in `main` at `1013b65db5` (2026-10-18). Line numbers are from that commit.

---

## Requirements

- **R1 — A case whose agent never ran is `not-run`, with its reason.** In `runCase`
  (`scripts/run-evals.ts` line 438), before grading, `neverRan(result, stream, r)` decides it.
  A case is `not-run` when either holds:
  - (a) the result document reports `0` for `input_tokens`, `output_tokens`,
    `cache_read_input_tokens` and `cache_creation_input_tokens`, and its `modelUsage` names no
    model;
  - (b) the process exited on its own (no `r.error`), printed no result document, and the
    stream holds no `assistant` event.

  The reason is the first match, in this order:
  - `api_error_status` 429 → `usage-limit`;
  - 401 or 403 → `auth`;
  - else the text of `result`, or else stderr, tested against the limit wording and against the
    auth wording `benchmarks/axes/agent.ts` already uses (`RATE_TEXT`, `AUTH_TEXT`, plus
    `hit your .*limit`);
  - else `did-not-start`.

  The case also carries `excerpt`: the first 200 characters of that text, redacted the way
  `redact` does.

  The text never decides `not-run`. It only names the reason. A case with any token stays
  `pass`, `fail` or `error` exactly as today. So does a spawn error (`r.error`, including the
  180 s timeout).

  *Check:* `scripts/run-evals.test.ts` ›
  `R1 — a usage-limit stop is not-run, with its reason, never a failure`. A fixture of the
  observed document (below) through the exported `caseOutcome` gives
  `{ status: 'not-run', reason: 'usage-limit', excerpt: "You've hit your weekly limit · resets Oct 18, 5am (UTC)" }`.
  Beside it, `R1 — a run that spent tokens and failed its checks is still a failure` and
  `R1 — the limit wording with tokens spent is a failure, not a skip`.

  *Red on main:* `runCase` has no such branch, so `status` is `'fail'`, the verdict the
  2026-10-15 line holds.

- **R2 — The history line records it, with no score (v2).** `HISTORY_VERSION` becomes `2`.
  - `CaseStatus` gains `'not-run'`. A not-run case is
    `{ status: 'not-run', reason, excerpt, turns: null, tokens: null }`.
  - `tasks.passed` and `tasks.total` count only the cases that ran. A new `tasks.notRun`
    counts the rest.
  - When every case is not-run, `tasks.status` is `'not-run'` and `tasks.reason` is their
    reason, or `mixed`. `model` stays `null`.
  - `historyProblems` accepts v1 lines unchanged. For a v2 line it requires:
    - `Object.keys(cases).length === total + notRun`;
    - every not-run case carries a `reason` from the vocabulary
      (`usage-limit | auth | did-not-start`);
    - a `not-run` run has `total` 0.

  *Check:* `scripts/eval-history-lock.test.ts` ›
  `R2 — records a run whose agent never ran as not-run, with no pass rate`, and
  `R2 — rejects a v2 line whose counts include a not-run case`.

  *Red on main:* `historyLine` returns `status: 'ran', passed: 0, total: 11`, and
  `'not-run'` is outside `caseProblems`' enum.

- **R3 — The false line is corrected, and cannot recur.**
  `evals/history/2026-10-15-29362dc-38717342918.json` is rewritten as the v2 line R1 and R2
  would have written. The date, commit, run and `config: {4,4}` stay. Layer 1 did run.
  All 11 cases are `not-run`, `usage-limit`, with the run's own message. `tasks` is
  `{ status: 'not-run', reason: 'usage-limit', passed: 0, total: 0, notRun: 11 }`.

  The committed-files block also gains a rule: a `fail` or `error` case whose tokens are all `0`
  is rejected, with the message "a zero-token case is a run that never happened; record it
  not-run".

  *Check:* `scripts/eval-history-lock.test.ts` › `every committed history file is one valid line`
  (renamed from "… one v1 line"), with the new rule.

  *Red on main:* the 2026-10-15 file fails the zero-token rule for all 11 cases.

- **R4 — Readers skip not-run, and say so.** `scripts/eval-history.ts` exports:
  - `readHistory(root)`: every committed line, in file-name order;
  - `measured(lines)`: the lines whose layer 2 ran, dropping `skipped` and `not-run` lines;
  - `caseSeries(lines, id)`: one case's `{ date, status, turns, tokens }` over the runs where
    it ran.

  A streak ("N consecutive runs at n of n") is counted over `measured(lines)`. A not-run or
  skipped week neither extends it nor breaks it. A median of turns or tokens never includes a
  not-run case.

  `locale-pack-in-five` R3 and burgee U9 are restated against this reader. That is a criterion
  edit, recorded in the build PR.

  *Check:* `scripts/eval-history-lock.test.ts` ›
  `R4 — a not-run week neither breaks nor counts toward a series`. The fixture is
  `[10/10, 11 not-run, 10/10]`: the streak is 2, and the turns median of one case over
  `[7, not-run, 5]` is 6, not 5.

  *Red on main:* no reader exists, so the import fails.

- **R5 — The run says "not run", loudly.**
  - Each not-run case logs `⏭ <id> — not run: <reason> "<excerpt>"`.
  - The rate line is `pass rate: <p>/<t> (<n> not run: <reason>)`.
  - A run with any not-run case still exits 1, as B1's gate does for an axis that measured
    nothing. Its last line is `⏭ <n> case(s) not run — not an eval failure`, never
    `💥 … eval failure(s)`.
  - When `$GITHUB_OUTPUT` is set, `run-evals.ts` writes `outcome=passed|failed|not-run` to it.
  - `evals.yml`'s scheduled issue step reads that value: `not-run` opens or comments on
    "Agent evals did not run" with the reason, and `failed` keeps "Agent evals are failing".

  *Check:* `scripts/run-evals.test.ts` ›
  `R5 — a run with not-run cases names them and is not called a failure`, over an exported pure
  `verdict(results)`. Also `scripts/eval-history-lock.test.ts`'s `evals.yml` block ›
  `R5 — a week that did not run opens "did not run", not "failing"`.

  *Red on main:* no `verdict`, and the workflow has one title.

- **R6 — B1: a sweep the limit cut short is not a reading.** In `benchmarks/axes/agent.ts`:
  - `runOne` marks an attempt `notRun: true` by R1's rule (a), and gives it `usage: false`, so
    `measured()` (line 620) leaves it out of every median and total.
  - `failure.kind` stays `rate-limit` or `auth`.
  - `sweepAll` (line 975): if any CLI-arm attempt is `notRun`, the axis returns `{ reason }`
    naming the count and the first excerpt: "`<n>` of `<m>` `<variant>` task-runs did not run
    (`usage-limit`): …". A partial CLI sweep compares two task mixes, so it is never a
    reading.
  - On the MCP arm, any `notRun` attempt makes the arm leave its ungated record with no ratio,
    as `armFailed` does today for an arm whose every run failed. The CLI readings of the week
    stand.
  - `success-rate`'s denominator never counts a not-run attempt.

  *Check:* `benchmarks/agent.test.ts`:
  - `R6 — a sweep the usage limit cut short is not a reading`. A stub `claude` answers the
    observed limit document from its 31st call on: burgee's 25 runs pass, and commander is
    cut after 5. `run()` returns `{ reason: /did not run \(usage-limit\)/ }`.
  - `R6 — an MCP arm cut short leaves no ratio`: the stub limits from the 60th call. No
    `mcp-tokens-total-ratio` record, and the CLI records are present.

  *Red on main:* the first returns records whose commander medians include zero-token runs. The
  second emits a ratio over zero-token runs.

### The fixture

Both locks use the same one-line result document. It is assembled from the fields B1's
classifier printed for run 38400890695 and the message run 38717342918 printed. Usage is all
zeros because the 2026-10-15 line recorded exactly that. `modelUsage` is `{}` because the line
recorded `model: null`.

```json
{"type":"result","subtype":"success","is_error":true,"api_error_status":429,"terminal_reason":"api_error","num_turns":1,"result":"You've hit your weekly limit · resets Oct 18, 5am (UTC)","usage":{"input_tokens":0,"output_tokens":0,"cache_read_input_tokens":0,"cache_creation_input_tokens":0},"modelUsage":{}}
```

Before the build PR merges, compare it with a real transcript from B1's `b1-transcripts`
artifact (run 38400890695, artifact 11815071230, kept until about 2026-10-27). If `claude`
emits a synthetic assistant event before the result, rule (b) never fires for this shape. Rule
(a) still does, which is why (a) is the primary rule.

## Design

One predicate, written twice, because `scripts/` and `benchmarks/` share no module today, and
importing across them for 20 lines is a larger change than the duplicate. Each copy is held by
the same fixture, so the two cannot drift silently.

The history format moves to v2, because the enum widens and `total` changes meaning. A plotter
of v1 that read `passed/total` would otherwise compute 0/11 again. v1 lines stay valid and are
never rewritten, except the one false line R3 corrects.

Order:
1. R1 + R2 + R3 in one PR (the runner, the format, the correction).
2. R4 (the reader, and the two criterion restatements).
3. R5 (the workflow).
4. R6 (B1) in its own PR, because `benchmarks/` has its own owners and bands.

## Verification

| R | Check | Red on main |
| :-- | :-- | :-- |
| R1 | `scripts/run-evals.test.ts` › `R1 — a usage-limit stop is not-run, with its reason, never a failure` | `status: 'fail'` |
| R2 | `scripts/eval-history-lock.test.ts` › `R2 — records a run whose agent never ran as not-run, with no pass rate` | `passed 0, total 11`; `not-run` not in the enum |
| R3 | `scripts/eval-history-lock.test.ts` › `every committed history file is one valid line` | the 2026-10-15 file: 11 zero-token `fail` cases |
| R4 | `scripts/eval-history-lock.test.ts` › `R4 — a not-run week neither breaks nor counts toward a series` | no reader to import |
| R5 | `scripts/run-evals.test.ts` › `R5 — …`; `eval-history-lock.test.ts` › `R5 — a week that did not run opens "did not run", not "failing"` | no `verdict`; one issue title |
| R6 | `benchmarks/agent.test.ts` › `R6 — a sweep the usage limit cut short is not a reading`; `R6 — an MCP arm cut short leaves no ratio` | a reading lands with zero-token runs; a ratio over them |

Each lock is run against `git checkout HEAD -- <source>` before the source change, and the red
message is recorded in the PR (rule 4).

## Quint model: needed? No

No state, ordering, concurrency, retry or deadline is introduced. R1 is a pure classification of
one document, and R4 is a filter over a list. B1's sweep order is unchanged. R6 only changes what
an already-collected list of attempts is allowed to produce. The tracker's `Q?` for B1 is `n`,
and this does not change it.

## Rejected alternatives

- **Decide `not-run` from the message text.** It is the CLI's wording and it changes:
  `RATE_TEXT` already misses "weekly limit", and only `api_error_status` caught 2026-10-13. Zero
  tokens with no model billed is the evidence that no model ran, whatever the wording.
- **Delete the 2026-10-15 line.** Layer 1 ran and passed 4 of 4. Deleting the week hides that
  the job ran. Rewriting it keeps the run and drops only the false verdict.
- **Keep v1 and add the status.** `total` would have to keep counting not-run cases, and every
  reader dividing `passed/total` would compute 0/11 again.
- **Retry the case after a pause.** The limit resets days later ("resets Oct 18" on Oct 13 and
  15). A retry inside a 20-minute job learns nothing.
- **Let a not-run week pass green.** The 2026-10-15 week measured nothing. A green tick would
  hide that for as long as the subscription stays exhausted.

## Out of scope

- Splitting the subscription between B1's push readings and the weekly evals. That is the
  likely cause of the exhaustion, but it is unmeasured (see `NOTES.md`).
- Re-running the eval after the reset. Any scheduled run with quota left lands a real line.
- Closing issue #1103. The owner can close it once R3's correction is on `main`.

## Status

| R | Status | Where | Check |
| :-- | :-- | :-- | :-- |
| R1 | Not built | `scripts/run-evals.ts` (`runCase`, `caseOutcome`) | `scripts/run-evals.test.ts` › `R1 — …` |
| R2 | Not built | `scripts/eval-history.ts` (v2, `historyProblems`) | `scripts/eval-history-lock.test.ts` › `R2 — …` |
| R3 | Not built | `evals/history/2026-10-15-29362dc-38717342918.json` | `scripts/eval-history-lock.test.ts` › `every committed history file is one valid line` |
| R4 | Not built | `scripts/eval-history.ts` (`readHistory`, `measured`, `caseSeries`) | `scripts/eval-history-lock.test.ts` › `R4 — …` |
| R5 | Not built | `scripts/run-evals.ts` (`verdict`), `.github/workflows/evals.yml` | `run-evals.test.ts` › `R5 — …`; `eval-history-lock.test.ts` › `R5 — …` |
| R6 | Not built | `benchmarks/axes/agent.ts` (`runOne`, `sweepAll`, `armRecords`) | `benchmarks/agent.test.ts` › `R6 — …` (two cases) |

**Built: 0. Not built: 6.**
