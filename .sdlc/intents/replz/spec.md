# Design — `replz`

Intent: [`intent.md`](./intent.md). **Status:** draft.

---

## Requirements

- **R1** A case schema: `id`, `kind` (`bug` or `control`), `pr`, `base`, `head`, `answer` (one
  sentence, bugs only), `set` (`tune` or `test`). Validated by `validator`.
- **R2** `replz run [--set test]` creates a git worktree per case at `base`, applies `head`,
  runs the configured reviewer command and check commands, and stores raw outputs.
- **R3** Scoring: a grader prompt judges whether each finding describes the answer key; scores
  are stored per stage the reviewer reports.
- **R4** The report lists recall per stage, severity per finding, false alarms on controls, and a
  firing table per check and checklist item. `--json` for history.
- **R5** ~~`replz mine` reads merged PRs' review comments and reverts through `gh`, clusters them,
  and writes candidates seen in at least two PRs to a draft file.~~ Split on 2026-11-24 (see
  Status): drafting cases from history shipped as `replz propose`; mining rule candidates moved to
  [`replz-mine`](../replz-mine/intent.md), a new command and so a minor of 1.x.
- **R6** Results append to a history file held by a lock test, like `evals/history/`.

## Design

- A burgee CLI. Worktrees reuse the approach of `mutation-weekly.sh`.
- The reviewer is a command in config, so it is the same prompt and REVIEW.md as CI.
- The grader is a separate model call with the answer key and one finding at a time.
- Order: R1, then 5 + 5 cases by hand, R2–R4, R6, then R5.

## Verification

- `packages/replz/src/*.test.ts` with a fake reviewer that returns fixed findings, asserting
  recall, false alarms and firing counts exactly.
- One planted case whose answer the fake reviewer finds and one it misses; the report shows 1 of 2.
- oxmutate through `mutation:changed`.

## Status

Read on 2026-11-24 for the 1.0 bar (D-170), recorded in
[`D-20261124-replz-1-0`](../../decisions/D-20261124-replz-1-0.md).

| R   | Status    | Where                                                                                                            | Check                                                                                                                        |
| :-- | :-------- | :--------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------- |
| R1  | **Built** | `cases.ts` (`parseCase`, `selectCases`)                                                                          | `cases.test.ts` › `needs an answer on a bug and refuses one on a control`, `refuses two cases with one id, even across sets` |
| R2  | **Built** | `run.ts` (`replayCase`), `shell.ts`, `cli.ts` (`run --set`)                                                      | `run.test.ts` › `reviews in the head worktree, runs every check, grades each finding up to the cap, and removes the tree`    |
| R3  | **Built** | `run.ts` (`gradePrompt`, `isYes`, one grader call per finding, `maxFindings` cap)                                | `run.test.ts` › `gives the answer key, one finding and the question`, `never grades a control`                               |
| R4  | **Built** | `score.ts` (`score`, the text report; `--json` through burgee)                                                   | `score.test.ts` › `counts recall per stage…`, `counts each check and item: fired, and right`                                 |
| R5  | **Split** | the case-drafting half is `propose.ts` (`replz propose`); rule mining is [`replz-mine`](../replz-mine/intent.md) | `cli.test.ts` › `drafts case files from the log`                                                                             |
| R6  | **Built** | `cli.ts` (`HISTORY`, `run --record` appends)                                                                     | `scripts/replz-lock.test.ts`                                                                                                 |

**Built: 5. Split: 1. Not built: 0.**

## Rejected alternatives

- **One end-to-end score.** It hides a pipeline that finds a bug and then drops it in
  verification; the post measures per stage for that reason.
- **Running per PR.** Cost scales with cases; monthly is enough to see a change, as the playbook
  suggests.
- **Grading by keyword match.** A finding can name the right file and the wrong bug.

## Out of scope

- Changing the reviewer. replz measures; triggerlist and REVIEW.md are what change.
- Production incident tracking. Cases are written by hand or drafted by `propose`.
