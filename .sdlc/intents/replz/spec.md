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
- **R5** `replz mine` reads merged PRs' review comments and reverts through `gh`, clusters them,
  and writes candidates seen in at least two PRs to a draft file.
- **R6** Results append to a history file held by a lock test, like `evals/history/`.

## Design

- A burgee CLI. Worktrees reuse the approach of `mutation-weekly.sh`.
- The reviewer is a command in config, so it is the same prompt and REVIEW.md as CI.
- The grader is a separate model call with the answer key and one finding at a time.
- Order: R1, then 5 + 5 cases by hand, R2–R4, R6, then R5.

## Verification

- `packages/replz/src/*.test.ts` with a fake reviewer that returns fixed findings, asserting
  recall, false alarms and firing counts exactly.
- One planted case whose answer the fake reviewer finds and one it misses; the report shows 1 of
  2.
- oxmutate through `mutation:changed`.

## Rejected alternatives

- **One end-to-end score.** It hides a pipeline that finds a bug and then drops it in
  verification; the post measures per stage for that reason.
- **Running per PR.** Cost scales with cases; monthly is enough to see a change, as the playbook
  suggests.
- **Grading by keyword match.** A finding can name the right file and the wrong bug.

## Out of scope

- Changing the reviewer. replz measures; triggerlist and REVIEW.md are what change.
- Production incident tracking. Cases are written by hand or proposed by `mine`.
